-- =============================================================================
-- Vérifications de la migration 056 — À EXÉCUTER SUR UN PROJET DE TEST
-- (SQL Editor Supabase). Chaque requête indique le résultat attendu.
-- Ce script n'a PAS été exécuté lors de sa rédaction.
-- =============================================================================

-- 1) Fonctions sensibles : aucun accès pour anon/authenticated (attendu : false partout)
SELECT 'approve_listing_deletion / anon' AS controle,
       has_function_privilege('anon', 'public.approve_listing_deletion(uuid,uuid,uuid)', 'EXECUTE') AS autorise;      -- false
SELECT 'execute_authorized_withdrawal / authenticated',
       has_function_privilege('authenticated', 'public.execute_authorized_withdrawal(uuid,uuid,text,uuid,uuid)', 'EXECUTE'); -- false
SELECT 'process_payment_webhook / authenticated',
       has_function_privilege('authenticated', 'public.process_payment_webhook(text,text)', 'EXECUTE');             -- false
SELECT 'create_pending_rent_payment / authenticated',
       has_function_privilege('authenticated', 'public.create_pending_rent_payment(uuid,uuid,integer,public.operator_enum,text,uuid)', 'EXECUTE'); -- false

-- 2) Le hash du code n'est plus dans users (attendu : 0 ligne) et la table dédiée est fermée (attendu : false, false)
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' AND column_name LIKE 'withdrawal_%';
SELECT has_table_privilege('authenticated', 'public.withdrawal_pins', 'SELECT') AS select_authenticated,
       has_table_privilege('anon',          'public.withdrawal_pins', 'SELECT') AS select_anon;

-- 3) Index redondants supprimés (attendu : 0 ligne) et index unique du ledger (attendu : 1 ligne)
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname IN
 ('idx_leases_tenant_id','idx_leases_property_id','idx_rent_periods_lease_id','idx_payments_rent_period_id','idx_withdrawals_wallet_id','idx_unique_active_lease_per_property');
SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'uniq_financial_ledger_reference_entry';

-- 4) Déclencheurs présents (attendu : 3 lignes)
SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname IN
 ('tr_prevent_invalid_withdrawal_state_transitions','trg_protect_contact_request_columns','trg_protect_listing_moderation_fields');

-- 5) Limites des buckets (attendu : avatars 5242880, listing-photos 10485760, types image uniquement)
SELECT id, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id IN ('avatars','listing-photos');

-- 6) Colonnes modifiables sur notifications par les clients (attendu : is_read uniquement)
SELECT column_name FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'notifications' AND grantee = 'authenticated' AND privilege_type = 'UPDATE';

-- =============================================================================
-- 7) SCÉNARIO : le blocage du code de retrait doit être ENREGISTRÉ (test TC-PIN-04)
--    Remplacer les identifiants par ceux d'un propriétaire VÉRIFIÉ de test.
--    Le tout est annulé à la fin (ROLLBACK).
-- =============================================================================
BEGIN;
  -- Variables de test (à adapter)
  CREATE TEMP TABLE _t AS SELECT
    '98ab7b3d-baab-464d-b121-c7b27636c8f3'::uuid AS owner_id,
    'd4a82700-8794-4446-8d47-9dec3eaf99b0'::uuid AS wallet_id;

  -- Prépare un code connu (1234) pour le propriétaire de test
  INSERT INTO public.withdrawal_pins (user_id, pin_hash)
  SELECT owner_id, crypt('1234', gen_salt('bf')) FROM _t
  ON CONFLICT (user_id) DO UPDATE SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL;

  -- Trois mauvais codes (chacun avec une clé d'idempotence différente)
  SELECT * FROM public.execute_authorized_withdrawal((SELECT owner_id FROM _t), gen_random_uuid(), '0000', (SELECT wallet_id FROM _t), gen_random_uuid());
  SELECT * FROM public.execute_authorized_withdrawal((SELECT owner_id FROM _t), gen_random_uuid(), '0000', (SELECT wallet_id FROM _t), gen_random_uuid());
  SELECT * FROM public.execute_authorized_withdrawal((SELECT owner_id FROM _t), gen_random_uuid(), '0000', (SELECT wallet_id FROM _t), gen_random_uuid());
  -- Attendu : error_code = 'pin_incorrect' trois fois

  SELECT failed_attempts, locked_until FROM public.withdrawal_pins WHERE user_id = (SELECT owner_id FROM _t);
  -- Attendu : failed_attempts = 3 ET locked_until ≈ maintenant + 15 minutes

  -- Même avec le BON code, le retrait est refusé pendant le blocage
  SELECT * FROM public.execute_authorized_withdrawal((SELECT owner_id FROM _t), gen_random_uuid(), '1234', (SELECT wallet_id FROM _t), gen_random_uuid());
  -- Attendu : error_code = 'pin_locked'
ROLLBACK;
