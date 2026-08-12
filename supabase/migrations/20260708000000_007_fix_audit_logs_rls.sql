-- Migration 007 : Correction Policy RLS audit_logs + publication instantanée
-- Date: 2026-07-08
-- Objectif:
--   1. Ajouter la policy INSERT manquante sur audit_logs (bloquait logAction() silencieusement)
--   2. Aucune modification SQL sur les listings (la correction de Publier.tsx gère cela côté code)

-- =====================================================================
-- 1. Policy INSERT sur audit_logs
--    Un utilisateur connecté peut insérer un log UNIQUEMENT pour lui-même
--    (user_id = son propre auth.uid()), jamais au nom d'un autre.
-- =====================================================================
DROP POLICY IF EXISTS "audit_logs_insert_own" ON audit_logs;
CREATE POLICY "audit_logs_insert_own" ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
