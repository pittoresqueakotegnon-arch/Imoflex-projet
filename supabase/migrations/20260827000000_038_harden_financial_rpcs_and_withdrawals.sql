-- ============================================================================
-- Migration 038 : fermeture des RPC financiers et retraits idempotents
--
-- Les fonctions SECURITY DEFINER ne doivent être appelables que par les Edge
-- Functions exécutées avec service_role. Les retraits sont créés et débités dans
-- la même transaction avant l'appel au PSP, afin qu'un timeout ne recrédite pas
-- un wallet alors qu'un payout a potentiellement été envoyé.
-- ============================================================================

BEGIN;

-- Une même requête client ne peut créer qu'un seul retrait.
ALTER TABLE public.withdrawals
  ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_wallet_idempotency_key_key
  ON public.withdrawals (wallet_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Les fonctions historiques restent utilisées par les Edge Functions et doivent
-- être totalement inaccessibles depuis le navigateur / Data API.
REVOKE ALL ON FUNCTION public.process_payment_webhook(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atomic_wallet_deduction(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.atomic_wallet_refund(UUID, NUMERIC) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.process_payment_webhook(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_wallet_deduction(UUID, NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.atomic_wallet_refund(UUID, NUMERIC) TO service_role;

ALTER FUNCTION public.process_payment_webhook(TEXT, TEXT) SET search_path = public, pg_temp;
ALTER FUNCTION public.atomic_wallet_deduction(UUID, NUMERIC) SET search_path = public, pg_temp;
ALTER FUNCTION public.atomic_wallet_refund(UUID, NUMERIC) SET search_path = public, pg_temp;

-- Crée le retrait et débite le wallet dans une transaction unique. Une seule
-- demande "en_traitement" est autorisée par wallet : elle bloque les doublons
-- jusqu'à réception du webhook ou intervention de rapprochement.
CREATE OR REPLACE FUNCTION public.create_withdrawal_and_deduct(
  p_wallet_id UUID,
  p_owner_id UUID,
  p_amount INTEGER,
  p_operator public.operator_enum,
  p_destination_phone TEXT,
  p_idempotency_key UUID
)
RETURNS TABLE (
  withdrawal_id UUID,
  withdrawal_status TEXT,
  already_exists BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wallet public.wallets%ROWTYPE;
  v_withdrawal public.withdrawals%ROWTYPE;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Montant de retrait invalide';
  END IF;

  -- Même clé : on retourne l'opération existante, sans second débit ni payout.
  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE wallet_id = p_wallet_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, true;
    RETURN;
  END IF;

  -- Sérialise les retraits du même wallet avant de vérifier les opérations en cours.
  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = p_wallet_id
    AND owner_id = p_owner_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet introuvable ou accès refusé';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.withdrawals
    WHERE wallet_id = p_wallet_id
      AND status = 'en_traitement'
  ) THEN
    RAISE EXCEPTION 'Un retrait est déjà en cours de traitement pour ce wallet';
  END IF;

  IF v_wallet.available_balance < p_amount THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  UPDATE public.wallets
  SET available_balance = available_balance - p_amount,
      total_withdrawn = total_withdrawn + p_amount
  WHERE id = p_wallet_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.withdrawals (
    wallet_id,
    amount,
    operator,
    destination_phone,
    status,
    idempotency_key,
    estimated_completion
  )
  VALUES (
    p_wallet_id,
    p_amount,
    p_operator,
    p_destination_phone,
    'en_traitement',
    p_idempotency_key,
    NOW() + INTERVAL '3 days'
  )
  RETURNING * INTO v_withdrawal;

  INSERT INTO public.financial_ledger (
    wallet_id, reference_type, reference_id, entry_type, amount, balance_after
  )
  VALUES (
    p_wallet_id, 'withdrawal', v_withdrawal.id, 'debit', p_amount, v_wallet.available_balance
  );

  RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, false;
END;
$$;

-- Rembourse une demande refusée de manière idempotente. Les webhooks répétés
-- n'effectuent donc jamais plusieurs crédits sur le même retrait.
CREATE OR REPLACE FUNCTION public.fail_withdrawal_and_refund(p_withdrawal_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_withdrawal public.withdrawals%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
BEGIN
  SELECT * INTO v_withdrawal
  FROM public.withdrawals
  WHERE id = p_withdrawal_id
  FOR UPDATE;

  IF NOT FOUND OR v_withdrawal.status <> 'en_traitement' THEN
    RETURN false;
  END IF;

  SELECT * INTO v_wallet
  FROM public.wallets
  WHERE id = v_withdrawal.wallet_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet introuvable pour ce retrait';
  END IF;

  UPDATE public.wallets
  SET available_balance = available_balance + v_withdrawal.amount,
      total_withdrawn = GREATEST(0, total_withdrawn - v_withdrawal.amount)
  WHERE id = v_wallet.id
  RETURNING * INTO v_wallet;

  UPDATE public.withdrawals
  SET status = 'echoue'
  WHERE id = v_withdrawal.id;

  INSERT INTO public.financial_ledger (
    wallet_id, reference_type, reference_id, entry_type, amount, balance_after
  )
  VALUES (
    v_wallet.id, 'withdrawal', v_withdrawal.id, 'credit', v_withdrawal.amount, v_wallet.available_balance
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_withdrawal_and_deduct(UUID, UUID, INTEGER, public.operator_enum, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_withdrawal_and_refund(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_withdrawal_and_deduct(UUID, UUID, INTEGER, public.operator_enum, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_withdrawal_and_refund(UUID) TO service_role;

-- Les nouvelles fonctions du schéma public sont fermées par défaut. Les fonctions
-- destinées au client doivent recevoir un GRANT explicite dans leur migration.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;

COMMIT;
