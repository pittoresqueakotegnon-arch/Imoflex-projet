-- Migration 009: Fix infinite recursion in users and audit_logs policies
-- Date: 2026-07-11
-- Objectif:
--   1. Éviter l'erreur HTTP 500 (Infinite Recursion) lors de la lecture de la table users.
--   2. Créer une fonction SECURITY DEFINER pour vérifier si un utilisateur est admin
--      sans déclencher les politiques RLS de la table users.
--   3. Mettre à jour les politiques de users et audit_logs pour utiliser cette fonction.

-- =====================================================================
-- 1. Fonction SECURITY DEFINER pour vérifier le rôle admin
-- =====================================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- 2. Nettoyage des anciennes politiques potentiellement récursives
-- =====================================================================
DROP POLICY IF EXISTS "users_select_admin" ON users;
DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
DROP POLICY IF EXISTS "users_update_admin" ON users;
DROP POLICY IF EXISTS "users_delete_admin" ON users;

-- =====================================================================
-- 3. Nouvelles politiques sécurisées (sans récursion)
-- =====================================================================
-- Politique de SELECT sur users pour les admins
CREATE POLICY "users_select_admin" ON users FOR SELECT
TO authenticated
USING ( is_admin() );

-- Politique d'UPDATE sur users pour les admins
CREATE POLICY "users_update_admin" ON users FOR UPDATE
TO authenticated
USING ( is_admin() )
WITH CHECK ( is_admin() );

-- Politique de DELETE sur users pour les admins
CREATE POLICY "users_delete_admin" ON users FOR DELETE
TO authenticated
USING ( is_admin() );

-- Politique de SELECT sur audit_logs pour les admins
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT
TO authenticated
USING ( is_admin() );
