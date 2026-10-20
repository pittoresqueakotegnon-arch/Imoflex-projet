-- ImoFlex - Migration 058 : Ajout du role agence

-- 1. Ajout du role agence dans l enum user_role
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'agence';

-- 2. Table agences_profiles
CREATE TABLE IF NOT EXISTS agences_profiles (
  id               UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  nom_agence       VARCHAR(200) NOT NULL,
  ifu              VARCHAR(50),
  rccm             VARCHAR(100),
  adresse          TEXT,
  ville            VARCHAR(100),
  description      TEXT,
  logo_url         TEXT,
  site_web         VARCHAR(255),
  email_contact    VARCHAR(255),
  phone_agence     VARCHAR(30),
  is_verified      BOOLEAN DEFAULT false,
  verified_at      TIMESTAMP WITH TIME ZONE,
  verified_by      UUID REFERENCES public.users(id),
  created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE agences_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agences_profiles_select_own" ON agences_profiles;
CREATE POLICY "agences_profiles_select_own" ON agences_profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "agences_profiles_insert_own" ON agences_profiles;
CREATE POLICY "agences_profiles_insert_own" ON agences_profiles FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "agences_profiles_update_own" ON agences_profiles;
CREATE POLICY "agences_profiles_update_own" ON agences_profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "agences_profiles_service_role_all" ON agences_profiles;
CREATE POLICY "agences_profiles_service_role_all" ON agences_profiles FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "agences_profiles_admin_select" ON agences_profiles;
CREATE POLICY "agences_profiles_admin_select" ON agences_profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid() AND u.role = 'admin'
  )
);

-- 3. Trigger updated_at
CREATE OR REPLACE FUNCTION update_agences_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS agences_profiles_updated_at ON agences_profiles;
CREATE TRIGGER agences_profiles_updated_at
  BEFORE UPDATE ON agences_profiles
  FOR EACH ROW EXECUTE FUNCTION update_agences_profiles_updated_at();

-- 4. Table agence_mandats
CREATE TABLE IF NOT EXISTS agence_mandats (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agence_id       UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  owner_id        UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  listing_id      UUID REFERENCES listings(id) ON DELETE SET NULL,
  property_id     UUID REFERENCES properties(id) ON DELETE SET NULL,
  status          VARCHAR(30) NOT NULL DEFAULT 'actif'
                    CHECK (status IN ('actif', 'suspendu', 'termine')),
  commission_rate NUMERIC(5, 2) DEFAULT 10.00,
  notes           TEXT,
  created_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE agence_mandats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agence_mandats_agence_select" ON agence_mandats;
CREATE POLICY "agence_mandats_agence_select" ON agence_mandats FOR SELECT
TO authenticated
USING (agence_id = auth.uid());

DROP POLICY IF EXISTS "agence_mandats_agence_insert" ON agence_mandats;
CREATE POLICY "agence_mandats_agence_insert" ON agence_mandats FOR INSERT
TO authenticated
WITH CHECK (agence_id = auth.uid());

DROP POLICY IF EXISTS "agence_mandats_agence_update" ON agence_mandats;
CREATE POLICY "agence_mandats_agence_update" ON agence_mandats FOR UPDATE
TO authenticated
USING (agence_id = auth.uid())
WITH CHECK (agence_id = auth.uid());

DROP POLICY IF EXISTS "agence_mandats_owner_select" ON agence_mandats;
CREATE POLICY "agence_mandats_owner_select" ON agence_mandats FOR SELECT
TO authenticated
USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "agence_mandats_service_role" ON agence_mandats;
CREATE POLICY "agence_mandats_service_role" ON agence_mandats FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS agence_mandats_updated_at ON agence_mandats;
CREATE TRIGGER agence_mandats_updated_at
  BEFORE UPDATE ON agence_mandats
  FOR EACH ROW EXECUTE FUNCTION update_agences_profiles_updated_at();

COMMENT ON TABLE agences_profiles IS 'Profil etendu pour les agences immobilieres inscrites sur Imoflex.';
COMMENT ON TABLE agence_mandats IS 'Mandats de gestion entre une agence et les proprietaires quelle represente.';
