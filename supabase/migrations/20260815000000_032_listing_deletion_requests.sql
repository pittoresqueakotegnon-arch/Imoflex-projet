-- Migration 032: Gestion professionnelle des demandes de suppression d'annonces
-- Date: 2026-08-15
-- Objectif: Permettre aux propriétaires de demander la suppression de leurs annonces,
--           avec validation/refus administratif et conservation de l'historique (soft delete).

-- 1. Étendre listing_status_enum
DO $$ BEGIN
  ALTER TYPE listing_status_enum ADD VALUE IF NOT EXISTS 'suppression_demandee';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE listing_status_enum ADD VALUE IF NOT EXISTS 'supprimee';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Étendre notification_type_enum pour les retours de suppression
DO $$ BEGIN
  ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'suppression_annonce_approuvee';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'suppression_annonce_rejetee';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TYPE notification_type_enum ADD VALUE IF NOT EXISTS 'suppression_annonce_demandee';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Table des demandes de suppression d'annonces
CREATE TABLE IF NOT EXISTS listing_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason VARCHAR(255) NOT NULL,
  custom_reason TEXT,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
  admin_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE
);

-- Index pour performances et intégrité
CREATE INDEX IF NOT EXISTS idx_deletion_requests_listing ON listing_deletion_requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_owner ON listing_deletion_requests(owner_id);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_status ON listing_deletion_requests(status);
CREATE INDEX IF NOT EXISTS idx_deletion_requests_created_at ON listing_deletion_requests(created_at DESC);

-- Empêcher plusieurs demandes simultanées en attente pour une même annonce
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_pending_deletion ON listing_deletion_requests(listing_id) WHERE status = 'pending';

-- 4. RLS sur listing_deletion_requests
ALTER TABLE listing_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Le propriétaire peut voir ses propres demandes
DROP POLICY IF EXISTS "deletion_requests_select_own" ON listing_deletion_requests;
CREATE POLICY "deletion_requests_select_own" ON listing_deletion_requests FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- Le propriétaire peut insérer une demande pour sa propre annonce
DROP POLICY IF EXISTS "deletion_requests_insert_own" ON listing_deletion_requests;
CREATE POLICY "deletion_requests_insert_own" ON listing_deletion_requests FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = owner_id AND
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = listing_id AND l.owner_id = auth.uid()
  )
);

-- L'admin peut voir toutes les demandes
DROP POLICY IF EXISTS "deletion_requests_select_admin" ON listing_deletion_requests;
CREATE POLICY "deletion_requests_select_admin" ON listing_deletion_requests FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- L'admin peut mettre à jour les demandes (approuver/refuser/ajouter note)
DROP POLICY IF EXISTS "deletion_requests_update_admin" ON listing_deletion_requests;
CREATE POLICY "deletion_requests_update_admin" ON listing_deletion_requests FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- Service role accès complet
DROP POLICY IF EXISTS "deletion_requests_service_role" ON listing_deletion_requests;
CREATE POLICY "deletion_requests_service_role" ON listing_deletion_requests FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- 5. S'assurer des permissions administratives sur les annonces
DROP POLICY IF EXISTS "listings_update_admin" ON listings;
CREATE POLICY "listings_update_admin" ON listings FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "listings_delete_admin" ON listings;
CREATE POLICY "listings_delete_admin" ON listings FOR DELETE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);
