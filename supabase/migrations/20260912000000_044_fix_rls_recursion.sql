-- ============================================================================
-- Migration 044 : Fix RLS infinite recursion on leases / properties / users
-- ============================================================================
--
-- Problem:
--   When loading the user profile at login, Supabase evaluates the RLS policies
--   for the "leases" table. The policy chain creates a circular dependency:
--
--   users (read) → users_select_as_tenant/owner → leases (read)
--                → leases_select_owner → properties (read)
--                → properties_select_tenant_active_lease → leases (read) ← ♻️ LOOP
--
-- Fix:
--   Replace the self-referencing policies with SECURITY DEFINER helper
--   functions that bypass RLS internally and therefore cannot recurse.
--   These functions are drop-in equivalents of the inline EXISTS(...) checks.
-- ============================================================================

-- ─── Helper: is the current user the owner of a given property? ─────────────
CREATE OR REPLACE FUNCTION public.is_property_owner(p_property_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.properties
    WHERE id = p_property_id
      AND owner_id = auth.uid()
  );
END;
$$;

-- ─── Helper: does the current user have an active lease on a given property? ─
CREATE OR REPLACE FUNCTION public.is_active_tenant_of(p_property_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.leases
    WHERE property_id = p_property_id
      AND tenant_id = auth.uid()
      AND status = 'actif'
  );
END;
$$;

-- ─── Helper: is the current user a tenant on any lease owned by another user? ─
CREATE OR REPLACE FUNCTION public.is_tenant_of_owner(p_owner_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.leases l
    JOIN public.properties p ON p.id = l.property_id
    WHERE l.tenant_id = auth.uid()
      AND p.owner_id = p_owner_id
  );
END;
$$;

-- ─── Helper: is the current user the owner of a property where a user is tenant? ─
CREATE OR REPLACE FUNCTION public.is_owner_of_tenant(p_tenant_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.leases l
    JOIN public.properties p ON p.id = l.property_id
    WHERE l.tenant_id = p_tenant_id
      AND p.owner_id = auth.uid()
  );
END;
$$;

-- ============================================================================
-- Rewrite leases policies to break the leases → properties → leases cycle
-- ============================================================================

DROP POLICY IF EXISTS "leases_select_owner" ON public.leases;
CREATE POLICY "leases_select_owner" ON public.leases FOR SELECT
TO authenticated
USING ( is_property_owner(property_id) );

-- ============================================================================
-- Rewrite properties policy to break the properties → leases → properties cycle
-- ============================================================================

DROP POLICY IF EXISTS "properties_select_tenant_active_lease" ON public.properties;
CREATE POLICY "properties_select_tenant_active_lease" ON public.properties FOR SELECT
TO authenticated
USING ( is_active_tenant_of(id) );

-- ============================================================================
-- Rewrite users cross-read policies to use the SECURITY DEFINER helpers
-- ============================================================================

-- Tenants can read their landlord's profile
DROP POLICY IF EXISTS "users_select_as_tenant" ON public.users;
CREATE POLICY "users_select_as_tenant" ON public.users FOR SELECT
TO authenticated
USING ( is_tenant_of_owner(id) );

-- Landlords can read their tenants' profile
DROP POLICY IF EXISTS "users_select_as_owner" ON public.users;
CREATE POLICY "users_select_as_owner" ON public.users FOR SELECT
TO authenticated
USING ( is_owner_of_tenant(id) );
