-- =============================================================================
-- 057 — Contrats de bail officiels et États des lieux photographiques
--
-- Conforme à la loi béninoise n° 2022-30 (Bail à usage d'habitation)
-- et loi béninoise n° 2017-20 (Code du numérique / Preuve électronique).
--
-- Objets créés :
-- 1. Fonctions de contrôle d'accès : is_lease_participant, is_lease_owner, is_lease_tenant
-- 2. Table lease_contracts (contrats PDF, versioning, consentement et signatures tracées)
-- 3. Table property_inspections (états des lieux entrée / sortie, compteurs SBEÉ/SONEB, clés)
-- 4. Table property_inspection_items (constat pièce par pièce avec photos et état)
-- 5. Bucket privé lease-documents avec politiques RLS strictes
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Fonctions de contrôle d'accès aux baux
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_lease_participant(p_lease_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.leases l
        JOIN public.properties p ON p.id = l.property_id
        WHERE l.id = p_lease_id
          AND (
              l.tenant_id = auth.uid() 
              OR p.owner_id = auth.uid()
              OR public.is_admin()
          )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_lease_owner(p_lease_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.leases l
        JOIN public.properties p ON p.id = l.property_id
        WHERE l.id = p_lease_id
          AND (
              p.owner_id = auth.uid()
              OR public.is_admin()
          )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_lease_tenant(p_lease_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM public.leases l
        WHERE l.id = p_lease_id
          AND (
              l.tenant_id = auth.uid()
              OR public.is_admin()
          )
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Table lease_contracts : Contrat de bail officiel
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lease_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    contract_number VARCHAR(60) NOT NULL UNIQUE,
    version INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(30) NOT NULL DEFAULT 'brouillon' 
        CHECK (status IN ('brouillon', 'en_attente_locataire', 'en_attente_proprietaire', 'signe', 'resilie')),
    
    -- Termes contractuels réels
    monthly_rent INTEGER NOT NULL CHECK (monthly_rent > 0),
    deposit_amount INTEGER DEFAULT 0 CHECK (deposit_amount >= 0),
    advance_amount INTEGER DEFAULT 0 CHECK (advance_amount >= 0),
    charges_amount INTEGER DEFAULT 0 CHECK (charges_amount >= 0),
    payment_deadline_day SMALLINT NOT NULL DEFAULT 5 CHECK (payment_deadline_day BETWEEN 1 AND 28),
    duration_months INTEGER NOT NULL DEFAULT 12 CHECK (duration_months > 0),
    start_date DATE NOT NULL,
    end_date DATE,
    property_usage VARCHAR(50) NOT NULL DEFAULT 'habitation_exclusive',
    notice_period_months SMALLINT NOT NULL DEFAULT 3 CHECK (notice_period_months > 0),
    special_clauses TEXT,
    
    -- Consentement & Tracé Propriétaire (Loi 2017-20 Bénin)
    owner_consent BOOLEAN NOT NULL DEFAULT false,
    owner_signed_at TIMESTAMPTZ,
    owner_signature_svg TEXT,
    owner_signer_name VARCHAR(150),
    owner_signer_ip TEXT,
    
    -- Consentement & Tracé Locataire (Loi 2017-20 Bénin)
    tenant_consent BOOLEAN NOT NULL DEFAULT false,
    tenant_signed_at TIMESTAMPTZ,
    tenant_signature_svg TEXT,
    tenant_signer_name VARCHAR(150),
    tenant_signer_ip TEXT,
    
    -- Intégrité et Scellement
    document_hash VARCHAR(64), -- Empreinte SHA-256 du document signé
    pdf_storage_path TEXT,     -- Chemin dans le bucket privé 'lease-documents'
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lease_contracts_lease_id ON public.lease_contracts(lease_id);
CREATE INDEX IF NOT EXISTS idx_lease_contracts_status ON public.lease_contracts(status);

ALTER TABLE public.lease_contracts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lease_contracts_select ON public.lease_contracts;
CREATE POLICY lease_contracts_select ON public.lease_contracts
    FOR SELECT TO authenticated
    USING (public.is_lease_participant(lease_id));

DROP POLICY IF EXISTS lease_contracts_insert_owner ON public.lease_contracts;
CREATE POLICY lease_contracts_insert_owner ON public.lease_contracts
    FOR INSERT TO authenticated
    WITH CHECK (public.is_lease_owner(lease_id));

DROP POLICY IF EXISTS lease_contracts_update_participant ON public.lease_contracts;
CREATE POLICY lease_contracts_update_participant ON public.lease_contracts
    FOR UPDATE TO authenticated
    USING (public.is_lease_participant(lease_id))
    WITH CHECK (public.is_lease_participant(lease_id));

DROP POLICY IF EXISTS lease_contracts_delete_owner ON public.lease_contracts;
CREATE POLICY lease_contracts_delete_owner ON public.lease_contracts
    FOR DELETE TO authenticated
    USING (public.is_lease_owner(lease_id) AND status = 'brouillon');

DROP POLICY IF EXISTS lease_contracts_service_role ON public.lease_contracts;
CREATE POLICY lease_contracts_service_role ON public.lease_contracts
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 3. Table property_inspections : État des lieux (Entrée & Sortie)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lease_id UUID NOT NULL REFERENCES public.leases(id) ON DELETE CASCADE,
    inspection_type VARCHAR(15) NOT NULL CHECK (inspection_type IN ('entree', 'sortie')),
    inspection_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'brouillon'
        CHECK (status IN ('brouillon', 'en_attente_validation', 'valide', 'conteste')),
    conducted_by_id UUID REFERENCES public.users(id),
    
    -- Relevés compteurs et remise des clés
    water_meter_reading VARCHAR(50),
    electric_meter_reading VARCHAR(50),
    keys_handed_count SMALLINT DEFAULT 1 CHECK (keys_handed_count >= 0),
    keys_description TEXT,
    general_observations TEXT,
    tenant_reserves TEXT, -- Réserves éventuelles émises par le locataire
    
    -- Confirmation contradictoire
    owner_confirmed_at TIMESTAMPTZ,
    owner_signature_svg TEXT,
    tenant_confirmed_at TIMESTAMPTZ,
    tenant_signature_svg TEXT,
    
    pdf_report_path TEXT,
    document_hash VARCHAR(64),
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_inspections_lease_id ON public.property_inspections(lease_id);
CREATE INDEX IF NOT EXISTS idx_property_inspections_type ON public.property_inspections(inspection_type);

ALTER TABLE public.property_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_inspections_select ON public.property_inspections;
CREATE POLICY property_inspections_select ON public.property_inspections
    FOR SELECT TO authenticated
    USING (public.is_lease_participant(lease_id));

DROP POLICY IF EXISTS property_inspections_insert ON public.property_inspections;
CREATE POLICY property_inspections_insert ON public.property_inspections
    FOR INSERT TO authenticated
    WITH CHECK (public.is_lease_participant(lease_id));

DROP POLICY IF EXISTS property_inspections_update ON public.property_inspections;
CREATE POLICY property_inspections_update ON public.property_inspections
    FOR UPDATE TO authenticated
    USING (public.is_lease_participant(lease_id))
    WITH CHECK (public.is_lease_participant(lease_id));

DROP POLICY IF EXISTS property_inspections_delete ON public.property_inspections;
CREATE POLICY property_inspections_delete ON public.property_inspections
    FOR DELETE TO authenticated
    USING (public.is_lease_owner(lease_id) AND status = 'brouillon');

DROP POLICY IF EXISTS property_inspections_service_role ON public.property_inspections;
CREATE POLICY property_inspections_service_role ON public.property_inspections
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 4. Table property_inspection_items : Constats et photos par pièce
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.property_inspection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inspection_id UUID NOT NULL REFERENCES public.property_inspections(id) ON DELETE CASCADE,
    room_name VARCHAR(100) NOT NULL,
    element_name VARCHAR(100) NOT NULL,
    condition_state VARCHAR(20) NOT NULL DEFAULT 'bon' 
        CHECK (condition_state IN ('neuf', 'bon', 'moyen', 'mauvais', 'degrade')),
    comment TEXT,
    photo_paths JSONB NOT NULL DEFAULT '[]'::jsonb,
    display_order SMALLINT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection_id ON public.property_inspection_items(inspection_id);

ALTER TABLE public.property_inspection_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inspection_items_select ON public.property_inspection_items;
CREATE POLICY inspection_items_select ON public.property_inspection_items
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_inspections pi
            WHERE pi.id = property_inspection_items.inspection_id
              AND public.is_lease_participant(pi.lease_id)
        )
    );

DROP POLICY IF EXISTS inspection_items_insert ON public.property_inspection_items;
CREATE POLICY inspection_items_insert ON public.property_inspection_items
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.property_inspections pi
            WHERE pi.id = property_inspection_items.inspection_id
              AND public.is_lease_participant(pi.lease_id)
        )
    );

DROP POLICY IF EXISTS inspection_items_update ON public.property_inspection_items;
CREATE POLICY inspection_items_update ON public.property_inspection_items
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_inspections pi
            WHERE pi.id = property_inspection_items.inspection_id
              AND public.is_lease_participant(pi.lease_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.property_inspections pi
            WHERE pi.id = property_inspection_items.inspection_id
              AND public.is_lease_participant(pi.lease_id)
        )
    );

DROP POLICY IF EXISTS inspection_items_delete ON public.property_inspection_items;
CREATE POLICY inspection_items_delete ON public.property_inspection_items
    FOR DELETE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.property_inspections pi
            WHERE pi.id = property_inspection_items.inspection_id
              AND public.is_lease_owner(pi.lease_id)
              AND pi.status = 'brouillon'
        )
    );

DROP POLICY IF EXISTS inspection_items_service_role ON public.property_inspection_items;
CREATE POLICY inspection_items_service_role ON public.property_inspection_items
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- 5. Bucket de stockage privé pour les documents de bail
-- -----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'lease-documents',
    'lease-documents',
    false, -- STRICTEMENT PRIVÉ
    15728640, -- 15 Mo max
    ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/webp'::text]
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 15728640,
    allowed_mime_types = ARRAY['application/pdf'::text, 'image/jpeg'::text, 'image/png'::text, 'image/webp'::text];

-- Politiques RLS pour storage.objects dans le bucket 'lease-documents'
-- Convention de stockage : lease-documents/{lease_id}/...
DROP POLICY IF EXISTS lease_documents_select ON storage.objects;
CREATE POLICY lease_documents_select ON storage.objects
    FOR SELECT TO authenticated
    USING (
        bucket_id = 'lease-documents'
        AND (
            public.is_admin()
            OR (
                -- Le premier segment du chemin est le lease_id
                storage.foldername(name) IS NOT NULL
                AND array_length(storage.foldername(name), 1) >= 1
                AND public.is_lease_participant((storage.foldername(name))[1]::uuid)
            )
        )
    );

DROP POLICY IF EXISTS lease_documents_insert ON storage.objects;
CREATE POLICY lease_documents_insert ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'lease-documents'
        AND (
            public.is_admin()
            OR (
                storage.foldername(name) IS NOT NULL
                AND array_length(storage.foldername(name), 1) >= 1
                AND public.is_lease_participant((storage.foldername(name))[1]::uuid)
            )
        )
    );

DROP POLICY IF EXISTS lease_documents_delete ON storage.objects;
CREATE POLICY lease_documents_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'lease-documents'
        AND (
            public.is_admin()
            OR (
                storage.foldername(name) IS NOT NULL
                AND array_length(storage.foldername(name), 1) >= 1
                AND public.is_lease_owner((storage.foldername(name))[1]::uuid)
            )
        )
    );
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
