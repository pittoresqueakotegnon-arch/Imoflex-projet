-- Paiements et retraits : contrôles serveur autoritaires et PIN cohérent
BEGIN;

-- Réserve atomiquement une fraction réellement payable de l'échéance.
-- Les paiements en attente sont inclus dans le calcul pour empêcher deux
-- requêtes concurrentes de réserver le même solde.
CREATE OR REPLACE FUNCTION public.create_pending_rent_payment(
  p_rent_period_id UUID,
  p_tenant_id UUID,
  p_amount INTEGER,
  p_operator public.operator_enum,
  p_fedapay_transaction_id TEXT,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS TABLE (payment_id UUID, payment_status TEXT, already_exists BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_period public.rent_periods%ROWTYPE;
  v_existing public.payments%ROWTYPE;
  v_reserved NUMERIC := 0;
  v_remaining NUMERIC := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_amount IS NULL OR p_amount < 100 OR p_amount > 300000 THEN
    RAISE EXCEPTION 'Montant de paiement invalide';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.payments
    WHERE tenant_id = p_tenant_id AND idempotency_key = p_idempotency_key
    FOR UPDATE;
    IF FOUND THEN
      RETURN QUERY SELECT v_existing.id, v_existing.status::TEXT, true;
      RETURN;
    END IF;
  END IF;

  SELECT rp.* INTO v_period
  FROM public.rent_periods rp
  JOIN public.leases l ON l.id = rp.lease_id
  WHERE rp.id = p_rent_period_id
    AND l.tenant_id = p_tenant_id
    AND l.status = 'actif'
    AND rp.status IN ('en_cours', 'retard')
  FOR UPDATE OF rp;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Échéance introuvable, inactive ou accès refusé';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_reserved
  FROM public.payments
  WHERE rent_period_id = v_period.id AND status = 'en_attente';
  v_remaining := v_period.amount_due - v_period.amount_paid - v_reserved;

  IF p_amount > v_remaining THEN
    RAISE EXCEPTION 'Montant supérieur au solde réellement payable';
  END IF;

  INSERT INTO public.payments (
    rent_period_id, tenant_id, amount, payment_method, operator, status,
    fedapay_transaction_id, idempotency_key
  ) VALUES (
    v_period.id, p_tenant_id, p_amount, 'mobile_money', p_operator,
    'en_attente', p_fedapay_transaction_id, p_idempotency_key
  ) RETURNING id, status::TEXT INTO payment_id, payment_status;
  already_exists := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_pending_rent_payment(UUID, UUID, INTEGER, public.operator_enum, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_pending_rent_payment(UUID, UUID, INTEGER, public.operator_enum, TEXT, UUID) TO service_role;

-- Les autorisations de retrait ne doivent jamais être créées directement par
-- PostgREST : le client pourrait sinon choisir un montant ou un bénéficiaire.
DROP POLICY IF EXISTS "Users can create their own authorizations" ON public.withdrawal_authorizations;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.withdrawal_authorizations FROM authenticated, anon, PUBLIC;

CREATE OR REPLACE FUNCTION public.create_withdrawal_authorization(
  p_amount INTEGER,
  p_destination_phone TEXT,
  p_operator public.operator_enum
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_authorization_id UUID;
  v_phone TEXT := regexp_replace(COALESCE(p_destination_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Montant invalide'; END IF;
  IF v_phone !~ '^[0-9]{10}$' THEN RAISE EXCEPTION 'Numéro Mobile Money invalide'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_user_id AND role = 'proprietaire' AND is_active = true
      AND owner_verification_status = 'verifie' AND owner_verified_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'Retrait indisponible : identité non vérifiée'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wallets WHERE owner_id = v_user_id AND available_balance >= p_amount) THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  INSERT INTO public.withdrawal_authorizations (user_id, amount, destination_phone, operator)
  VALUES (v_user_id, p_amount, v_phone, p_operator)
  RETURNING id INTO v_authorization_id;
  RETURN v_authorization_id;
END;
$$;

-- Remplace la version initiale qui écrivait dans ledger_entries/processed_at,
-- absents du schéma. Le débit et son écriture comptable restent atomiques.
CREATE OR REPLACE FUNCTION public.execute_authorized_withdrawal(
  p_auth_id UUID,
  p_pin TEXT,
  p_wallet_id UUID,
  p_idempotency_key UUID
)
RETURNS TABLE (withdrawal_id UUID, withdrawal_status TEXT, already_exists BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user public.users%ROWTYPE;
  v_auth public.withdrawal_authorizations%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_withdrawal public.withdrawals%ROWTYPE;
BEGIN
  IF v_user_id IS NULL OR p_pin !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'Authentification ou PIN invalide'; END IF;
  SELECT * INTO v_withdrawal FROM public.withdrawals
  WHERE wallet_id = p_wallet_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, true;
    RETURN;
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND OR v_user.role <> 'proprietaire' OR v_user.owner_verification_status <> 'verifie' OR v_user.owner_verified_at IS NULL THEN
    RAISE EXCEPTION 'Retrait indisponible : identité non vérifiée';
  END IF;
  IF v_user.withdrawal_locked_until > now() THEN RAISE EXCEPTION 'Retraits temporairement bloqués'; END IF;
  IF v_user.withdrawal_pin_hash IS NULL THEN RAISE EXCEPTION 'Code PIN non configuré'; END IF;
  IF crypt(p_pin, v_user.withdrawal_pin_hash) <> v_user.withdrawal_pin_hash THEN
    UPDATE public.users SET withdrawal_pin_attempts = COALESCE(withdrawal_pin_attempts, 0) + 1,
      withdrawal_locked_until = CASE WHEN COALESCE(withdrawal_pin_attempts, 0) + 1 >= 3 THEN now() + interval '15 minutes' ELSE withdrawal_locked_until END
    WHERE id = v_user_id;
    RAISE EXCEPTION 'Code de retrait incorrect';
  END IF;

  SELECT * INTO v_auth FROM public.withdrawal_authorizations
  WHERE id = p_auth_id AND user_id = v_user_id AND used = false AND expires_at >= now() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Autorisation invalide ou expirée'; END IF;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = p_wallet_id AND owner_id = v_user_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.available_balance < v_auth.amount THEN RAISE EXCEPTION 'Solde insuffisant'; END IF;
  IF EXISTS (SELECT 1 FROM public.withdrawals WHERE wallet_id = p_wallet_id AND status = 'en_traitement') THEN
    RAISE EXCEPTION 'Un retrait est déjà en cours de traitement pour ce wallet';
  END IF;

  UPDATE public.users SET withdrawal_pin_attempts = 0, withdrawal_locked_until = NULL WHERE id = v_user_id;
  UPDATE public.withdrawal_authorizations SET used = true WHERE id = v_auth.id;
  UPDATE public.wallets SET available_balance = available_balance - v_auth.amount,
    total_withdrawn = total_withdrawn + v_auth.amount WHERE id = v_wallet.id
  RETURNING * INTO v_wallet;
  INSERT INTO public.withdrawals (wallet_id, amount, operator, destination_phone, status, idempotency_key, estimated_completion)
  VALUES (v_wallet.id, v_auth.amount, v_auth.operator, v_auth.destination_phone, 'en_traitement', p_idempotency_key, now() + interval '3 days')
  RETURNING * INTO v_withdrawal;
  INSERT INTO public.financial_ledger (wallet_id, reference_type, reference_id, entry_type, amount, balance_after)
  VALUES (v_wallet.id, 'withdrawal', v_withdrawal.id, 'debit', v_auth.amount, v_wallet.available_balance);
  RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, false;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_withdrawal_status(
  p_withdrawal_id UUID,
  p_new_status public.withdrawal_status_enum
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_withdrawal public.withdrawals%ROWTYPE; v_wallet public.wallets%ROWTYPE;
BEGIN
  IF p_new_status NOT IN ('complete', 'echoue') THEN RAISE EXCEPTION 'Statut de rapprochement invalide'; END IF;
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND OR v_withdrawal.status <> 'en_traitement' THEN RETURN false; END IF;
  IF p_new_status = 'complete' THEN
    UPDATE public.withdrawals SET status = 'complete', completed_at = now() WHERE id = v_withdrawal.id;
    RETURN true;
  END IF;
  SELECT * INTO v_wallet FROM public.wallets WHERE id = v_withdrawal.wallet_id FOR UPDATE;
  UPDATE public.wallets SET available_balance = available_balance + v_withdrawal.amount,
    total_withdrawn = GREATEST(0, total_withdrawn - v_withdrawal.amount) WHERE id = v_wallet.id RETURNING * INTO v_wallet;
  UPDATE public.withdrawals SET status = 'echoue' WHERE id = v_withdrawal.id;
  INSERT INTO public.financial_ledger (wallet_id, reference_type, reference_id, entry_type, amount, balance_after)
  VALUES (v_wallet.id, 'withdrawal', v_withdrawal.id, 'credit', v_withdrawal.amount, v_wallet.available_balance);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_withdrawal_authorization(INTEGER, TEXT, public.operator_enum) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.execute_authorized_withdrawal(UUID, TEXT, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reconcile_withdrawal_status(UUID, public.withdrawal_status_enum) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_initial_withdrawal_pin(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_withdrawal_authorization(INTEGER, TEXT, public.operator_enum) TO authenticated;
GRANT EXECUTE ON FUNCTION public.execute_authorized_withdrawal(UUID, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_withdrawal_status(UUID, public.withdrawal_status_enum) TO service_role;

COMMIT;
