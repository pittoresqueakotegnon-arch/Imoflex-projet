-- =============================================================================
-- 056 — Corrections de sécurité et du flux financier
--
-- Réfs documentation : S-01, S-02, S-03, S-04 (support), S-11, S-12, S-13,
-- E3, E4, E6, E9, E11, E12 (voir CORRECTIFS.md).
--
-- IMPORTANT : migration NON EXÉCUTÉE au moment de sa rédaction. À appliquer
-- d'abord sur un projet Supabase de test (voir supabase/tests/).
-- Ordre de déploiement : cette migration, PUIS les Edge Functions, PUIS le front.
-- La nouvelle signature de execute_authorized_withdrawal exige la nouvelle
-- version de la fonction Edge request-withdrawal.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Code de retrait (PIN) : table dédiée, inaccessible aux clients (S-02)
-- -----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.withdrawal_pins (
  user_id         UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  pin_hash        TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.withdrawal_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.withdrawal_pins FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.withdrawal_pins TO service_role;

DROP POLICY IF EXISTS withdrawal_pins_service_role ON public.withdrawal_pins;
CREATE POLICY withdrawal_pins_service_role ON public.withdrawal_pins
  FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Aucune politique pour anon/authenticated : ni lecture ni écriture directes.

-- Reprise des codes existants (hash bcrypt conservé tel quel)
INSERT INTO public.withdrawal_pins (user_id, pin_hash, failed_attempts, locked_until)
SELECT u.id, u.withdrawal_pin_hash, COALESCE(u.withdrawal_pin_attempts, 0), u.withdrawal_locked_until
FROM public.users u
WHERE u.withdrawal_pin_hash IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

-- La colonne calculée reste disponible pour le front (select has_withdrawal_pin)
CREATE OR REPLACE FUNCTION public.has_withdrawal_pin(u public.users)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (SELECT 1 FROM public.withdrawal_pins p WHERE p.user_id = u.id);
$$;

CREATE OR REPLACE FUNCTION public.set_initial_withdrawal_pin(p_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Le code doit contenir exactement 4 chiffres';
  END IF;

  PERFORM 1 FROM public.users WHERE id = v_user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.withdrawal_pins WHERE user_id = v_user_id) THEN
    RAISE EXCEPTION 'Le code PIN est déjà configuré';
  END IF;

  INSERT INTO public.withdrawal_pins (user_id, pin_hash)
  VALUES (v_user_id, crypt(p_pin, gen_salt('bf')));
  RETURN TRUE;
END;
$$;

-- Changement du code par son propriétaire (les erreurs sont comptées et conservées)
CREATE OR REPLACE FUNCTION public.change_withdrawal_pin(p_old_pin TEXT, p_new_pin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_pin public.withdrawal_pins%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_old_pin IS NULL OR p_old_pin !~ '^[0-9]{4}$' OR p_new_pin IS NULL OR p_new_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Le code doit contenir exactement 4 chiffres';
  END IF;

  SELECT * INTO v_pin FROM public.withdrawal_pins WHERE user_id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code PIN non configuré';
  END IF;

  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until <= now() THEN
    UPDATE public.withdrawal_pins SET failed_attempts = 0, locked_until = NULL, updated_at = now()
    WHERE user_id = v_user_id;
    v_pin.failed_attempts := 0;
    v_pin.locked_until := NULL;
  END IF;
  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
    RAISE EXCEPTION 'Changement de code temporairement bloqué';
  END IF;

  IF crypt(p_old_pin, v_pin.pin_hash) <> v_pin.pin_hash THEN
    UPDATE public.withdrawal_pins
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 3 THEN now() + interval '15 minutes' ELSE locked_until END,
        updated_at = now()
    WHERE user_id = v_user_id;
    RETURN FALSE; -- pas d'exception : le compteur doit être enregistré
  END IF;

  UPDATE public.withdrawal_pins
  SET pin_hash = crypt(p_new_pin, gen_salt('bf')), failed_attempts = 0, locked_until = NULL, updated_at = now()
  WHERE user_id = v_user_id;
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.change_withdrawal_pin(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_withdrawal_pin(TEXT, TEXT) TO authenticated;

-- Réinitialisation par un administrateur (après vérification d'identité hors application)
CREATE OR REPLACE FUNCTION public.admin_reset_withdrawal_pin(p_user_id UUID, p_reason TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin UUID := auth.uid();
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès administrateur requis';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Un motif d''au moins 5 caractères est requis';
  END IF;

  DELETE FROM public.withdrawal_pins WHERE user_id = p_user_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_admin, 'withdrawal_pin_reset', 'users', p_user_id, jsonb_build_object('reason', btrim(p_reason)));
  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_withdrawal_pin(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reset_withdrawal_pin(UUID, TEXT) TO authenticated;

-- Suppression des colonnes sensibles de la table users (le hash n'est plus lisible côté client)
ALTER TABLE public.users DROP COLUMN IF EXISTS withdrawal_pin_hash;
ALTER TABLE public.users DROP COLUMN IF EXISTS withdrawal_pin_attempts;
ALTER TABLE public.users DROP COLUMN IF EXISTS withdrawal_locked_until;

-- -----------------------------------------------------------------------------
-- 2. Autorisation de retrait : limitation + contrôles de compte (S-02)
-- -----------------------------------------------------------------------------
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
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;
  IF p_amount IS NULL OR p_amount < 100 THEN
    RAISE EXCEPTION 'Montant minimum de retrait : 100 FCFA';
  END IF;
  IF v_phone !~ '^[0-9]{10}$' THEN
    RAISE EXCEPTION 'Numéro Mobile Money invalide';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = v_user_id
      AND role = 'proprietaire'
      AND is_active = true
      AND COALESCE(account_status::text, 'actif') = 'actif'
      AND owner_verification_status = 'verifie'
      AND owner_verified_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Retrait indisponible : identité non vérifiée';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.withdrawal_pins
    WHERE user_id = v_user_id AND locked_until IS NOT NULL AND locked_until > now()
  ) THEN
    RAISE EXCEPTION 'Retraits temporairement bloqués';
  END IF;

  -- Limitation : 3 autorisations par minute et par utilisateur
  IF (
    SELECT count(*) FROM public.withdrawal_authorizations
    WHERE user_id = v_user_id AND created_at > now() - interval '1 minute'
  ) >= 3 THEN
    RAISE EXCEPTION 'Trop de demandes. Réessayez dans une minute.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.wallets WHERE owner_id = v_user_id AND available_balance >= p_amount
  ) THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  INSERT INTO public.withdrawal_authorizations (user_id, amount, destination_phone, operator)
  VALUES (v_user_id, p_amount, v_phone, p_operator)
  RETURNING id INTO v_authorization_id;

  RETURN v_authorization_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Exécution du retrait : réservée au service (Edge Function), erreurs de PIN
--    enregistrées (retour d'un code d'erreur au lieu d'une exception) (S-02, E12)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.execute_authorized_withdrawal(UUID, TEXT, UUID, UUID);

CREATE OR REPLACE FUNCTION public.execute_authorized_withdrawal(
  p_user_id UUID,
  p_auth_id UUID,
  p_pin TEXT,
  p_wallet_id UUID,
  p_idempotency_key UUID
)
RETURNS TABLE (withdrawal_id UUID, withdrawal_status TEXT, already_exists BOOLEAN, error_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_user public.users%ROWTYPE;
  v_pin public.withdrawal_pins%ROWTYPE;
  v_auth public.withdrawal_authorizations%ROWTYPE;
  v_wallet public.wallets%ROWTYPE;
  v_withdrawal public.withdrawals%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_pin IS NULL OR p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'Authentification ou PIN invalide';
  END IF;

  -- Idempotence : une même clé sur le wallet de l'utilisateur renvoie le retrait existant
  SELECT w.* INTO v_withdrawal
  FROM public.withdrawals w
  JOIN public.wallets wa ON wa.id = w.wallet_id AND wa.owner_id = p_user_id
  WHERE w.wallet_id = p_wallet_id AND w.idempotency_key = p_idempotency_key
  FOR UPDATE OF w;
  IF FOUND THEN
    RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, true, NULL::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND
     OR v_user.role <> 'proprietaire'
     OR v_user.owner_verification_status IS DISTINCT FROM 'verifie'
     OR v_user.owner_verified_at IS NULL
     OR COALESCE(v_user.is_active, false) = false
     OR COALESCE(v_user.account_status::text, 'actif') <> 'actif' THEN
    RAISE EXCEPTION 'Retrait indisponible : identité non vérifiée';
  END IF;

  SELECT * INTO v_pin FROM public.withdrawal_pins WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Code PIN non configuré';
  END IF;

  -- Fin d'un blocage : remise à zéro du compteur
  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until <= now() THEN
    UPDATE public.withdrawal_pins SET failed_attempts = 0, locked_until = NULL, updated_at = now()
    WHERE user_id = p_user_id;
    v_pin.failed_attempts := 0;
    v_pin.locked_until := NULL;
  END IF;

  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, false, 'pin_locked'::TEXT;
    RETURN;
  END IF;

  IF crypt(p_pin, v_pin.pin_hash) <> v_pin.pin_hash THEN
    UPDATE public.withdrawal_pins
    SET failed_attempts = failed_attempts + 1,
        locked_until = CASE WHEN failed_attempts + 1 >= 3 THEN now() + interval '15 minutes' ELSE locked_until END,
        updated_at = now()
    WHERE user_id = p_user_id;
    -- L'autorisation est consommée : chaque nouvel essai exige une nouvelle autorisation (limitée)
    UPDATE public.withdrawal_authorizations SET used = true WHERE id = p_auth_id AND user_id = p_user_id;
    RETURN QUERY SELECT NULL::UUID, NULL::TEXT, false, 'pin_incorrect'::TEXT;
    RETURN; -- pas d'exception : le compteur est enregistré
  END IF;

  SELECT * INTO v_auth
  FROM public.withdrawal_authorizations
  WHERE id = p_auth_id AND user_id = p_user_id AND used = false AND expires_at >= now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Autorisation invalide ou expirée';
  END IF;
  IF v_auth.amount < 100 THEN
    RAISE EXCEPTION 'Montant minimum de retrait : 100 FCFA';
  END IF;

  SELECT * INTO v_wallet FROM public.wallets WHERE id = p_wallet_id AND owner_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_wallet.available_balance < v_auth.amount THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  IF EXISTS (SELECT 1 FROM public.withdrawals WHERE wallet_id = p_wallet_id AND status = 'en_traitement') THEN
    RAISE EXCEPTION 'Un retrait est déjà en cours de traitement pour ce wallet';
  END IF;

  UPDATE public.withdrawal_pins
  SET failed_attempts = 0, locked_until = NULL, updated_at = now()
  WHERE user_id = p_user_id;

  UPDATE public.withdrawal_authorizations SET used = true WHERE id = v_auth.id;

  UPDATE public.wallets
  SET available_balance = available_balance - v_auth.amount,
      total_withdrawn = total_withdrawn + v_auth.amount
  WHERE id = v_wallet.id
  RETURNING * INTO v_wallet;

  INSERT INTO public.withdrawals (wallet_id, amount, operator, destination_phone, status, idempotency_key, estimated_completion)
  VALUES (v_wallet.id, v_auth.amount, v_auth.operator, v_auth.destination_phone, 'en_traitement', p_idempotency_key, now() + interval '3 days')
  RETURNING * INTO v_withdrawal;

  INSERT INTO public.financial_ledger (wallet_id, reference_type, reference_id, entry_type, amount, balance_after)
  VALUES (v_wallet.id, 'withdrawal', v_withdrawal.id, 'debit', v_auth.amount, v_wallet.available_balance);

  RETURN QUERY SELECT v_withdrawal.id, v_withdrawal.status::TEXT, false, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.execute_authorized_withdrawal(UUID, UUID, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_authorized_withdrawal(UUID, UUID, TEXT, UUID, UUID) TO service_role;

-- -----------------------------------------------------------------------------
-- 4. États finaux des retraits protégés + résolution manuelle tracée (E4, E3)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_invalid_withdrawal_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('complete', 'echoue') AND NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Transition de statut de retrait interdite : % vers %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_prevent_invalid_withdrawal_state_transitions ON public.withdrawals;
CREATE TRIGGER tr_prevent_invalid_withdrawal_state_transitions
  BEFORE UPDATE OF status ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_invalid_withdrawal_state_transitions();

-- Résolution par un administrateur d'un retrait bloqué (action 'refund' ou 'complete')
CREATE OR REPLACE FUNCTION public.admin_resolve_withdrawal(p_withdrawal_id UUID, p_action TEXT, p_note TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_done BOOLEAN;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès administrateur requis';
  END IF;
  IF p_action NOT IN ('refund', 'complete') THEN
    RAISE EXCEPTION 'Action invalide : refund ou complete attendu';
  END IF;
  IF p_note IS NULL OR length(btrim(p_note)) < 10 THEN
    RAISE EXCEPTION 'Une note d''au moins 10 caractères est requise (preuve de vérification chez le prestataire)';
  END IF;

  IF p_action = 'refund' THEN
    v_done := public.fail_withdrawal_and_refund(p_withdrawal_id);
  ELSE
    v_done := public.reconcile_withdrawal_status(p_withdrawal_id, 'complete');
  END IF;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_admin, 'admin_resolve_withdrawal', 'withdrawals', p_withdrawal_id,
          jsonb_build_object('action', p_action, 'applied', COALESCE(v_done, false), 'note', btrim(p_note)));

  RETURN COALESCE(v_done, false);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_resolve_withdrawal(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_resolve_withdrawal(UUID, TEXT, TEXT) TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. approve_listing_deletion : autorisation fondée sur l'utilisateur connecté (S-01)
--    Le paramètre p_admin_id est conservé pour compatibilité mais IGNORÉ.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_listing_deletion(
  p_request_id UUID,
  p_admin_id   UUID,
  p_listing_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin UUID := auth.uid();
  v_now TIMESTAMPTZ := now();
  v_request_listing UUID;
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Action réservée aux administrateurs.';
  END IF;

  SELECT listing_id INTO v_request_listing
  FROM public.listing_deletion_requests
  WHERE id = p_request_id AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND OR v_request_listing IS DISTINCT FROM p_listing_id THEN
    RAISE EXCEPTION 'Demande de suppression introuvable ou déjà traitée';
  END IF;

  UPDATE public.listing_deletion_requests
  SET status = 'approved', admin_id = v_admin, reviewed_at = v_now
  WHERE id = p_request_id;

  UPDATE public.listings
  SET status = 'supprimee', is_published = false, moderated_at = v_now, moderated_by = v_admin
  WHERE id = p_listing_id;

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (v_admin, 'listing_deletion_approved', 'listings', p_listing_id,
          jsonb_build_object('request_id', p_request_id));
END;
$$;

REVOKE ALL ON FUNCTION public.approve_listing_deletion(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_listing_deletion(UUID, UUID, UUID) TO authenticated;

-- Fonction héritée non utilisée par l'application (S-13)
DROP FUNCTION IF EXISTS public.admin_decide_owner_verification(UUID, TEXT, TEXT, TEXT);

-- -----------------------------------------------------------------------------
-- 6. Paiements : propriétaire introuvable, fenêtre de réservation (E9, E6)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_payment_webhook(p_fedapay_tx_id TEXT, p_event_type TEXT)
RETURNS json
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
    v_payment record;
    v_rent_period record;
    v_owner_id uuid;
    v_tenant_id uuid;
    v_commission_rate numeric;
    v_owner_amount numeric;
    v_commission_amount numeric;
    v_new_amount_paid numeric;
    v_new_rp_status public.rent_period_status_enum;
    v_wallet record;
BEGIN
    SELECT p.* INTO v_payment
    FROM public.payments p
    WHERE p.fedapay_transaction_id = p_fedapay_tx_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paiement introuvable';
    END IF;

    IF v_payment.status IN ('valide', 'echoue') THEN
        RETURN json_build_object('status', 'already_processed', 'payment_id', v_payment.id);
    END IF;

    v_tenant_id := v_payment.tenant_id;

    IF p_event_type = 'transaction.declined' THEN
        UPDATE public.payments SET status = 'echoue' WHERE id = v_payment.id;
        RETURN json_build_object(
            'status', 'declined',
            'payment_id', v_payment.id,
            'tenant_id', v_tenant_id,
            'amount', v_payment.amount
        );
    END IF;

    IF p_event_type != 'transaction.approved' THEN
        RAISE EXCEPTION 'Event type non supporté par ce RPC';
    END IF;

    SELECT rp.* INTO v_rent_period
    FROM public.rent_periods rp
    WHERE rp.id = v_payment.rent_period_id
    FOR UPDATE;

    SELECT pr.owner_id INTO v_owner_id
    FROM public.properties pr
    JOIN public.leases l ON l.property_id = pr.id
    WHERE l.id = v_rent_period.lease_id;

    -- Correction E9 : on ne valide jamais un paiement sans propriétaire à créditer.
    -- Le paiement reste en attente et l'erreur est visible (webhook en échec, rapprochement).
    IF v_owner_id IS NULL THEN
        RAISE EXCEPTION 'Propriétaire introuvable pour ce paiement';
    END IF;

    SELECT COALESCE((SELECT value::numeric FROM public.app_config WHERE key = 'commission_rate'), 6) INTO v_commission_rate;

    v_owner_amount := ROUND(v_payment.amount * (1.0 - (v_commission_rate / 100.0)), 0);
    v_commission_amount := v_payment.amount - v_owner_amount;

    UPDATE public.payments
    SET status = 'valide',
        validated_at = NOW(),
        commission_amount = v_commission_amount,
        commission_rate_applied = v_commission_rate
    WHERE id = v_payment.id;

    v_new_amount_paid := COALESCE(v_rent_period.amount_paid, 0) + v_payment.amount;
    IF v_new_amount_paid >= v_rent_period.amount_due THEN
        v_new_rp_status := 'solde';
    ELSE
        v_new_rp_status := 'en_cours';
    END IF;

    UPDATE public.rent_periods
    SET amount_paid = v_new_amount_paid,
        status = v_new_rp_status
    WHERE id = v_rent_period.id;

    SELECT * INTO v_wallet FROM public.wallets WHERE owner_id = v_owner_id FOR UPDATE;
    IF FOUND THEN
        UPDATE public.wallets
        SET available_balance = available_balance + v_owner_amount,
            total_earned = total_earned + v_owner_amount
        WHERE id = v_wallet.id
        RETURNING id, available_balance INTO v_wallet;
    ELSE
        INSERT INTO public.wallets (owner_id, available_balance, total_earned, total_withdrawn)
        VALUES (v_owner_id, v_owner_amount, v_owner_amount, 0)
        RETURNING id, available_balance INTO v_wallet;
    END IF;

    INSERT INTO public.financial_ledger (
        wallet_id, reference_type, reference_id, entry_type, amount, balance_after
    ) VALUES (
        v_wallet.id, 'payment', v_payment.id, 'credit', v_owner_amount, v_wallet.available_balance
    );

    RETURN json_build_object(
        'status', 'approved',
        'payment_id', v_payment.id,
        'owner_id', v_owner_id,
        'tenant_id', v_tenant_id,
        'amount', v_payment.amount,
        'owner_amount', v_owner_amount,
        'commission_rate', v_commission_rate
    );
END;
$$;

REVOKE ALL ON FUNCTION public.process_payment_webhook(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_payment_webhook(TEXT, TEXT) TO service_role;

-- Un paiement en attente depuis plus de 30 minutes ne réserve plus le solde du locataire
-- (il reste en attente pour le rapprochement : s'il est approuvé plus tard, il est crédité).
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
  WHERE rent_period_id = v_period.id
    AND status = 'en_attente'
    AND created_at > now() - interval '30 minutes';

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

-- -----------------------------------------------------------------------------
-- 7. Restrictions de colonnes (S-12)
-- -----------------------------------------------------------------------------
-- 7.1 notifications : seul is_read est modifiable par les clients
REVOKE UPDATE ON TABLE public.notifications FROM authenticated;
GRANT UPDATE (is_read) ON TABLE public.notifications TO authenticated;

-- 7.2 contact_requests : seul le statut est modifiable (propriétaire de l'annonce)
CREATE OR REPLACE FUNCTION public.protect_contact_request_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Appels internes (service role / sans utilisateur) : aucune restriction
  IF auth.uid() IS NULL
     OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.listing_id IS DISTINCT FROM OLD.listing_id
     OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
     OR NEW.message IS DISTINCT FROM OLD.message
     OR NEW.contact_phone IS DISTINCT FROM OLD.contact_phone
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Seul le statut d''une demande peut être modifié';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_contact_request_columns ON public.contact_requests;
CREATE TRIGGER trg_protect_contact_request_columns
  BEFORE UPDATE ON public.contact_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_contact_request_columns();

-- 7.3 listings : un propriétaire ne peut pas modifier les champs de modération
CREATE OR REPLACE FUNCTION public.protect_listing_moderation_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL
     OR COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.moderated_by IS DISTINCT FROM OLD.moderated_by
     OR NEW.moderated_at IS DISTINCT FROM OLD.moderated_at
     OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     OR NEW.is_published IS DISTINCT FROM OLD.is_published THEN
    RAISE EXCEPTION 'Modification des champs de modération réservée aux administrateurs';
  END IF;

  -- Statut : seule la demande de suppression (déjà contrôlée par un autre déclencheur) est permise
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text <> 'suppression_demandee' THEN
    RAISE EXCEPTION 'Changement de statut d''annonce réservé aux administrateurs';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_listing_moderation_fields ON public.listings;
CREATE TRIGGER trg_protect_listing_moderation_fields
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_listing_moderation_fields();

-- -----------------------------------------------------------------------------
-- 8. Stockage : limites de taille et de type côté serveur (S-11)
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif']
WHERE id = 'avatars';

UPDATE storage.buckets
SET file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/heic', 'image/heif']
WHERE id = 'listing-photos';

-- -----------------------------------------------------------------------------
-- 9. Nettoyage : index redondants et unicité du ledger
-- -----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_leases_tenant_id;
DROP INDEX IF EXISTS public.idx_leases_property_id;
DROP INDEX IF EXISTS public.idx_rent_periods_lease_id;
DROP INDEX IF EXISTS public.idx_payments_rent_period_id;
DROP INDEX IF EXISTS public.idx_withdrawals_wallet_id;
DROP INDEX IF EXISTS public.idx_unique_active_lease_per_property;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.financial_ledger
    GROUP BY reference_type, reference_id, entry_type
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Index unique du ledger NON créé : des doublons existent. Les examiner puis relancer la création.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_financial_ledger_reference_entry
      ON public.financial_ledger (reference_type, reference_id, entry_type);
  END IF;
END;
$$;
