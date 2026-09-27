-- Enable pgcrypto for hashing PINs
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Add PIN security columns to users
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS withdrawal_pin_hash TEXT,
ADD COLUMN IF NOT EXISTS withdrawal_pin_attempts INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS withdrawal_locked_until TIMESTAMPTZ;

-- 2. Computed column to know if PIN is set (safe for frontend)
CREATE OR REPLACE FUNCTION public.has_withdrawal_pin(u public.users)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT u.withdrawal_pin_hash IS NOT NULL;
$$;

-- 3. Table for temporary withdrawal authorizations
CREATE TABLE IF NOT EXISTS public.withdrawal_authorizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) NOT NULL,
  amount INTEGER NOT NULL,
  destination_phone TEXT NOT NULL,
  operator public.operator_enum NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 seconds'),
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.withdrawal_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.withdrawal_authorizations FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.withdrawal_authorizations TO authenticated;

CREATE POLICY "Users can read their own authorizations" 
ON public.withdrawal_authorizations FOR SELECT 
TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own authorizations" 
ON public.withdrawal_authorizations FOR INSERT 
TO authenticated WITH CHECK (auth.uid() = user_id);


-- 4. RPC to set the withdrawal PIN (only if not already set, or requires old pin? For V1, just allow setting if null)
CREATE OR REPLACE FUNCTION public.set_initial_withdrawal_pin(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_current_hash TEXT;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  IF length(p_pin) != 4 OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Le code doit contenir exactement 4 chiffres';
  END IF;

  SELECT withdrawal_pin_hash INTO v_current_hash FROM public.users WHERE id = v_user_id FOR UPDATE;
  
  IF v_current_hash IS NOT NULL THEN
    RAISE EXCEPTION 'Le code PIN est déjà configuré';
  END IF;

  UPDATE public.users
  SET withdrawal_pin_hash = crypt(p_pin, gen_salt('bf')),
      withdrawal_pin_attempts = 0,
      withdrawal_locked_until = NULL
  WHERE id = v_user_id;

  RETURN TRUE;
END;
$$;

-- 5. RPC to execute withdrawal with PIN validation
CREATE OR REPLACE FUNCTION public.execute_authorized_withdrawal(
  p_auth_id UUID,
  p_pin TEXT,
  p_wallet_id UUID,
  p_idempotency_key UUID
)
RETURNS TABLE (withdrawal_id UUID, withdrawal_status TEXT, already_exists BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user public.users%ROWTYPE;
  v_auth public.withdrawal_authorizations%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_withdrawal public.withdrawals%ROWTYPE;
  v_inserted_id UUID;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  -- Idempotency check first
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE wallet_id = p_wallet_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, true;
    RETURN;
  END IF;

  -- Lock user to prevent concurrent brute force attempts
  SELECT * INTO v_user FROM public.users WHERE id = v_user_id FOR UPDATE;
  
  IF v_user.withdrawal_locked_until IS NOT NULL AND v_user.withdrawal_locked_until > now() THEN
    RAISE EXCEPTION 'Retraits temporairement bloqués suite à plusieurs tentatives erronées. Réessayez plus tard.';
  END IF;

  IF v_user.owner_verification_status != 'verifie' THEN
    RAISE EXCEPTION 'Retrait indisponible : votre identité doit être vérifiée';
  END IF;

  -- Validate Authorization
  SELECT * INTO v_auth FROM public.withdrawal_authorizations WHERE id = p_auth_id AND user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Autorisation invalide'; END IF;
  IF v_auth.used THEN RAISE EXCEPTION 'Cette autorisation a déjà été utilisée'; END IF;
  IF v_auth.expires_at < now() THEN RAISE EXCEPTION 'Cette demande de retrait a expiré. Veuillez recommencer.'; END IF;

  -- Validate PIN
  IF v_user.withdrawal_pin_hash IS NULL THEN
    RAISE EXCEPTION 'Code PIN non configuré';
  END IF;

  IF crypt(p_pin, v_user.withdrawal_pin_hash) != v_user.withdrawal_pin_hash THEN
    -- Increment attempts
    UPDATE public.users SET withdrawal_pin_attempts = COALESCE(withdrawal_pin_attempts, 0) + 1 WHERE id = v_user_id;
    IF COALESCE(v_user.withdrawal_pin_attempts, 0) + 1 >= 3 THEN
      UPDATE public.users SET withdrawal_locked_until = now() + interval '15 minutes' WHERE id = v_user_id;
      
      INSERT INTO public.audit_logs (user_id, action, entity_type, details)
      VALUES (v_user_id, 'withdrawal_pin_brute_force_lock', 'users', '{"reason": "3 tentatives incorrectes"}');
      
      RAISE EXCEPTION 'Code incorrect. Votre compte est bloqué pour les retraits pendant 15 minutes.';
    ELSE
      RAISE EXCEPTION 'Code de retrait incorrect';
    END IF;
  END IF;

  -- PIN correct, reset attempts and lock
  UPDATE public.users SET withdrawal_pin_attempts = 0, withdrawal_locked_until = NULL WHERE id = v_user_id;

  -- Mark Auth as used
  UPDATE public.withdrawal_authorizations SET used = true WHERE id = p_auth_id;

  -- Process Wallet Deduction
  SELECT * INTO v_wallet FROM public.wallets WHERE id = p_wallet_id AND owner_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet introuvable'; END IF;
  IF v_wallet.available_balance < v_auth.amount THEN RAISE EXCEPTION 'Solde insuffisant'; END IF;

  IF EXISTS (SELECT 1 FROM public.withdrawals WHERE wallet_id = p_wallet_id AND status = 'en_traitement') THEN
    RAISE EXCEPTION 'Un retrait est déjà en cours de traitement pour ce wallet';
  END IF;

  UPDATE public.wallets SET available_balance = available_balance - v_auth.amount, total_withdrawn = total_withdrawn + v_auth.amount WHERE id = p_wallet_id;

  INSERT INTO public.withdrawals (
    wallet_id, amount, status, destination_phone, operator, idempotency_key
  ) VALUES (
    p_wallet_id, v_auth.amount, 'en_traitement', v_auth.destination_phone, v_auth.operator, p_idempotency_key
  ) RETURNING id INTO v_inserted_id;

  INSERT INTO public.ledger_entries (
    wallet_id, transaction_type, amount, balance_after, description, reference_id
  ) VALUES (
    p_wallet_id, 'withdrawal', v_auth.amount, v_wallet.available_balance - v_auth.amount, 'Retrait FedaPay (Traitement)', v_inserted_id
  );

  RETURN QUERY SELECT v_inserted_id, 'en_traitement'::TEXT, false;
END;
$$;

-- 6. RPC for withdrawal reconciliation
CREATE OR REPLACE FUNCTION public.reconcile_withdrawal_status(
  p_withdrawal_id UUID,
  p_new_status public.withdrawal_status_enum
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_withdrawal public.withdrawals%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
BEGIN
  SELECT * INTO v_withdrawal FROM public.withdrawals WHERE id = p_withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Retrait introuvable'; END IF;
  IF v_withdrawal.status != 'en_traitement' THEN
    RETURN FALSE; -- Already processed
  END IF;

  IF p_new_status = 'complete' THEN
    UPDATE public.withdrawals SET status = 'complete', processed_at = now() WHERE id = p_withdrawal_id;
  ELSIF p_new_status = 'echoue' THEN
    UPDATE public.withdrawals SET status = 'echoue', processed_at = now() WHERE id = p_withdrawal_id;
    
    -- Refund wallet
    SELECT * INTO v_wallet FROM public.wallets WHERE id = v_withdrawal.wallet_id FOR UPDATE;
    UPDATE public.wallets 
    SET available_balance = available_balance + v_withdrawal.amount,
        total_withdrawn = total_withdrawn - v_withdrawal.amount
    WHERE id = v_withdrawal.wallet_id;

    INSERT INTO public.ledger_entries (
      wallet_id, transaction_type, amount, balance_after, description, reference_id
    ) VALUES (
      v_withdrawal.wallet_id, 'refund', v_withdrawal.amount, v_wallet.available_balance + v_withdrawal.amount, 'Remboursement suite échec retrait', p_withdrawal_id
    );
  END IF;

  RETURN TRUE;
END;
$$;
