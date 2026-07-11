-- Migration 011: Politiques RLS admin pour dashboard complet
-- Date: 2026-07-11
-- Objectif:
--   Les requêtes du dashboard admin ont besoin d'accès en lecture sur plusieurs tables.
--   On utilise la fonction is_admin() (SECURITY DEFINER) pour éviter toute récursion.

-- S'assurer que is_admin() est définie (idempotent)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── leases ────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "leases_select_admin" ON leases;
CREATE POLICY "leases_select_admin" ON leases FOR SELECT
TO authenticated
USING ( is_admin() );

-- ── rent_periods ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "rent_periods_select_admin" ON rent_periods;
CREATE POLICY "rent_periods_select_admin" ON rent_periods FOR SELECT
TO authenticated
USING ( is_admin() );

-- ── payments ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "payments_select_admin" ON payments;
CREATE POLICY "payments_select_admin" ON payments FOR SELECT
TO authenticated
USING ( is_admin() );

-- ── contact_requests ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "contact_select_admin" ON contact_requests;
CREATE POLICY "contact_select_admin" ON contact_requests FOR SELECT
TO authenticated
USING ( is_admin() );

-- ── withdrawals ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "withdrawals_select_admin" ON withdrawals;
CREATE POLICY "withdrawals_select_admin" ON withdrawals FOR SELECT
TO authenticated
USING ( is_admin() );

-- ── wallets ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "wallets_select_admin" ON wallets;
CREATE POLICY "wallets_select_admin" ON wallets FOR SELECT
TO authenticated
USING ( is_admin() );

-- ── listings ──────────────────────────────────────────────────────────────────
-- L'admin doit voir toutes les annonces (y compris en_attente/rejetee)
DROP POLICY IF EXISTS "listings_select_admin" ON listings;
CREATE POLICY "listings_select_admin" ON listings FOR SELECT
TO authenticated
USING ( is_admin() );
