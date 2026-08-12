-- ============================================================
-- Migration 013 : Verrouillage du statut à l'insertion d'un paiement
--
-- Un tenant ne peut insérer un paiement qu'avec le statut 'en_attente'.
-- Seul le service_role (Edge Functions) peut passer à 'valide'/'echoue'.
-- ============================================================

-- Suppression de l'ancienne policy (sans contrainte de statut)
DROP POLICY IF EXISTS "payments_insert_tenant" ON payments;

-- Nouvelle policy : oblige status = 'en_attente' à l'insertion
CREATE POLICY "payments_insert_tenant" ON payments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = tenant_id AND status = 'en_attente');
