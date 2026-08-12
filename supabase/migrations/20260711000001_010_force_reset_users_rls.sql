-- Migration 010: Force reset of users policies to eliminate all custom infinite recursion policies
-- Date: 2026-07-11

-- 1. Fonction SECURITY DEFINER
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Supprimer ABSOLUMENT TOUTES les policies existantes sur 'users'
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'users' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
    END LOOP;
END $$;

-- 3. Recréer les policies standards de base (Propriétaire de son propre compte)
CREATE POLICY "users_select_own" ON users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "users_delete_own" ON users FOR DELETE TO authenticated USING (auth.uid() = id);

-- Accès complet pour les Edge Functions (service_role)
CREATE POLICY "users_service_role_all" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Ajouter les policies pour les administrateurs via is_admin() (Sans récursion)
CREATE POLICY "users_select_admin" ON users FOR SELECT TO authenticated USING ( is_admin() );
CREATE POLICY "users_update_admin" ON users FOR UPDATE TO authenticated USING ( is_admin() ) WITH CHECK ( is_admin() );
CREATE POLICY "users_delete_admin" ON users FOR DELETE TO authenticated USING ( is_admin() );

-- 5. Nettoyage similaire pour audit_logs au cas où
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'audit_logs' AND schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.audit_logs', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "audit_logs_insert_own" ON audit_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT TO authenticated USING ( is_admin() );
