-- ============================================================
-- Migration 016 : Suppression des policies d'écriture wallet côté client
--
-- Le client React (rôle `authenticated`) ne doit JAMAIS écrire
-- directement dans wallets. Seul service_role (Edge Functions)
-- peut créer ou modifier un wallet.
--
-- Avant d'appliquer cette migration, s'assurer que l'Edge Function
-- `create-wallet` est déployée — sinon la création du premier
-- wallet d'un propriétaire échouera côté client.
--
-- Policies conservées :
--   - wallets_select_own  : le propriétaire peut lire son wallet
--   - wallets_service_role : les Edge Functions ont accès complet
-- ============================================================

-- Suppression des policies d'écriture client
DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
