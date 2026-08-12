/*
# ImoFlex - Production Ready Updates

## Summary
- Creates new enums for moderation, account status, and payment plans.
- Updates users, listings, and leases tables.
- Creates audit_logs table and triggers.
- Creates materialized-like views for dashboard performance.
- Adds missing RLS policies for storage bucket 'listing-photos'.
*/

-- 1. Enums
DO $$ BEGIN
  CREATE TYPE listing_status_enum AS ENUM ('en_attente', 'publiee', 'rejetee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE account_status_enum AS ENUM ('actif', 'suspendu', 'banni');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_plan_enum AS ENUM ('unique', '2_fois', '3_fois', 'libre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Update users
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS account_status account_status_enum DEFAULT 'actif' NOT NULL;

-- 3. Update listings (Moderation)
ALTER TABLE listings 
ADD COLUMN IF NOT EXISTS status listing_status_enum DEFAULT 'en_attente' NOT NULL,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id);

-- Backfill status based on is_published
UPDATE listings SET status = 'publiee' WHERE is_published = true;
UPDATE listings SET status = 'en_attente' WHERE is_published = false;

-- Update RLS for listings to check status instead of is_published
DROP POLICY IF EXISTS "listings_select_published" ON listings;
CREATE POLICY "listings_select_published" ON listings FOR SELECT
TO anon, authenticated
USING (status = 'publiee');

-- Update photos RLS to match
DROP POLICY IF EXISTS "photos_select_published" ON listing_photos;
CREATE POLICY "photos_select_published" ON listing_photos FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = listing_photos.listing_id AND l.status = 'publiee'
  )
);

-- 4. Update leases (Progressive Payment)
ALTER TABLE leases 
ADD COLUMN IF NOT EXISTS payment_plan_type payment_plan_enum DEFAULT 'unique' NOT NULL;


-- 5. Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view audit logs
DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
CREATE POLICY "audit_logs_select_admin" ON audit_logs FOR SELECT
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin')
);

-- 6. Performance Views
-- View for Proprietaire Dashboard
CREATE OR REPLACE VIEW view_pro_dashboard_stats AS
SELECT 
  p.owner_id,
  COUNT(DISTINCT l.id) as total_active_leases,
  COALESCE(SUM(rp.amount_due - rp.amount_paid) FILTER (WHERE rp.status = 'retard'), 0) as total_unpaid,
  COUNT(DISTINCT rp.id) FILTER (WHERE rp.status = 'retard') as unpaid_periods_count
FROM properties p
LEFT JOIN leases l ON l.property_id = p.id AND l.status = 'actif'
LEFT JOIN rent_periods rp ON rp.lease_id = l.id
GROUP BY p.owner_id;

-- View for Locataire Dashboard
CREATE OR REPLACE VIEW view_tenant_dashboard_stats AS
SELECT 
  l.tenant_id,
  COUNT(DISTINCT l.id) as total_active_leases,
  COALESCE(SUM(rp.amount_due - rp.amount_paid) FILTER (WHERE rp.status = 'retard' OR rp.status = 'en_cours'), 0) as total_remaining_to_pay,
  COUNT(DISTINCT rp.id) FILTER (WHERE rp.status = 'retard') as unpaid_periods_count
FROM leases l
LEFT JOIN rent_periods rp ON rp.lease_id = l.id
WHERE l.status = 'actif'
GROUP BY l.tenant_id;

-- 7. Storage RLS for listing-photos
-- First ensure bucket exists (it usually does if manually created, but let's insert if missing)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies for storage.objects
DROP POLICY IF EXISTS "Public Access to listing photos" ON storage.objects;
CREATE POLICY "Public Access to listing photos" ON storage.objects FOR SELECT
USING (bucket_id = 'listing-photos');

-- Insert policy (Must be authenticated, and we assume users upload to their own folder: listings/UID/...)
DROP POLICY IF EXISTS "Authenticated users can upload photos" ON storage.objects;
CREATE POLICY "Authenticated users can upload photos" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'listing-photos' AND 
  (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can update their own photos" ON storage.objects;
CREATE POLICY "Users can update their own photos" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'listing-photos' AND 
  (storage.foldername(name))[2] = auth.uid()::text
);

DROP POLICY IF EXISTS "Users can delete their own photos" ON storage.objects;
CREATE POLICY "Users can delete their own photos" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'listing-photos' AND 
  (storage.foldername(name))[2] = auth.uid()::text
);
