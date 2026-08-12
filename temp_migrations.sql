
/*
# ImoFlex - Enums and Users table

## Summary
Creates all custom enum types and the users profile table that extends Supabase Auth.

## New Tables
- `users`: Extends auth.users with full_name, phone, role (locataire/proprietaire/admin/visiteur), 
  mobile money info, and account status.

## Security
- RLS enabled on users.
- Authenticated users can read/update their own profile.
- Public (anon) can NOT read users directly.
- Admin-like access handled via service role in edge functions.

## Notes
1. The users table references auth.users(id) with CASCADE DELETE.
2. A trigger auto-creates a users row when auth.users is created.
3. Role enum defaults to 'locataire' after registration choice.
*/

-- Create enum types
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('visiteur', 'locataire', 'proprietaire', 'admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE property_type_enum AS ENUM ('chambre', 'studio', 'appartement', 'maison', 'bureau', 'parcelle');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE availability_status_enum AS ENUM ('disponible', 'reserve', 'occupe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE room_label_enum AS ENUM ('facade', 'salon', 'chambre', 'cuisine', 'douche', 'cour', 'balcon', 'autre');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contact_status_enum AS ENUM ('nouvelle', 'traitee');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lease_status_enum AS ENUM ('actif', 'termine', 'suspendu');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE rent_period_status_enum AS ENUM ('en_cours', 'solde', 'retard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_method_enum AS ENUM ('mobile_money', 'carte_bancaire', 'wallet');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE operator_enum AS ENUM ('mtn', 'moov', 'celtiis');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status_enum AS ENUM ('en_attente', 'valide', 'echoue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE withdrawal_status_enum AS ENUM ('en_traitement', 'complete', 'echoue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE notification_type_enum AS ENUM (
    'rappel', 'confirmation', 'retard', 'nouveau_versement',
    'nouveau_locataire', 'nouvelle_demande_contact', 'retrait_complete', 'retrait_echoue'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Create users table (extends auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE,
  role user_role DEFAULT 'visiteur' NOT NULL,
  mobile_money_number VARCHAR(20),
  preferred_operator operator_enum,
  phone_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select_own" ON users;
CREATE POLICY "users_select_own" ON users FOR SELECT
TO authenticated
USING (auth.uid() = id);

DROP POLICY IF EXISTS "users_insert_own" ON users;
CREATE POLICY "users_insert_own" ON users FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_update_own" ON users;
CREATE POLICY "users_update_own" ON users FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "users_delete_own" ON users;
CREATE POLICY "users_delete_own" ON users FOR DELETE
TO authenticated
USING (auth.uid() = id);

-- Service role can do anything (for edge functions)
DROP POLICY IF EXISTS "users_service_role_all" ON users;
CREATE POLICY "users_service_role_all" ON users FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Function to handle new user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, full_name, phone, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'locataire')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

/*
# ImoFlex - Listings, Photos, Favorites, Contact Requests

## Summary
Creates marketplace listing tables:
- listings: Real estate announcements published by owners
- listing_photos: Photos for each listing stored in Supabase Storage
- favorites: Users can save listings to their favorites
- contact_requests: Tenant-to-owner contact requests

## Security
- RLS on all tables.
- Published listings are publicly visible (anon + authenticated).
- Owners manage their own listings.
- Favorites are private per user.
- Contact requests: requester sees own, listing owner sees all for their listings.
*/

-- Listings table
CREATE TABLE IF NOT EXISTS listings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  city VARCHAR(100) NOT NULL,
  neighborhood VARCHAR(100),
  address TEXT NOT NULL,
  property_type property_type_enum NOT NULL,
  monthly_rent INTEGER NOT NULL,
  deposit_amount INTEGER,
  advance_amount INTEGER,
  bedrooms SMALLINT,
  description TEXT,
  amenities JSONB DEFAULT '[]'::JSONB,
  house_rules TEXT,
  availability_status availability_status_enum DEFAULT 'disponible' NOT NULL,
  accepts_progressive_payment BOOLEAN DEFAULT true NOT NULL,
  is_published BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_city ON listings(city);
CREATE INDEX IF NOT EXISTS idx_listings_monthly_rent ON listings(monthly_rent);
CREATE INDEX IF NOT EXISTS idx_listings_availability ON listings(availability_status);
CREATE INDEX IF NOT EXISTS idx_listings_property_type ON listings(property_type);
CREATE INDEX IF NOT EXISTS idx_listings_published ON listings(is_published);
CREATE INDEX IF NOT EXISTS idx_listings_owner ON listings(owner_id);

ALTER TABLE listings ENABLE ROW LEVEL SECURITY;

-- Public can read published listings
DROP POLICY IF EXISTS "listings_select_published" ON listings;
CREATE POLICY "listings_select_published" ON listings FOR SELECT
TO anon, authenticated
USING (is_published = true);

-- Owners can see all their own listings (including unpublished)
DROP POLICY IF EXISTS "listings_select_own" ON listings;
CREATE POLICY "listings_select_own" ON listings FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "listings_insert_own" ON listings;
CREATE POLICY "listings_insert_own" ON listings FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "listings_update_own" ON listings;
CREATE POLICY "listings_update_own" ON listings FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "listings_delete_own" ON listings;
CREATE POLICY "listings_delete_own" ON listings FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "listings_service_role" ON listings;
CREATE POLICY "listings_service_role" ON listings FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Listing photos table
CREATE TABLE IF NOT EXISTS listing_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  photo_url VARCHAR(500) NOT NULL,
  room_label room_label_enum DEFAULT 'autre',
  display_order SMALLINT DEFAULT 0,
  is_cover BOOLEAN DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_listing_photos_listing ON listing_photos(listing_id);

ALTER TABLE listing_photos ENABLE ROW LEVEL SECURITY;

-- Public can read photos of published listings
DROP POLICY IF EXISTS "photos_select_published" ON listing_photos;
CREATE POLICY "photos_select_published" ON listing_photos FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = listing_photos.listing_id AND l.is_published = true
  )
);

-- Owner can manage photos of their listings
DROP POLICY IF EXISTS "photos_select_own" ON listing_photos;
CREATE POLICY "photos_select_own" ON listing_photos FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = listing_photos.listing_id AND l.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "photos_insert_own" ON listing_photos;
CREATE POLICY "photos_insert_own" ON listing_photos FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = listing_photos.listing_id AND l.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "photos_update_own" ON listing_photos;
CREATE POLICY "photos_update_own" ON listing_photos FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = listing_photos.listing_id AND l.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "photos_delete_own" ON listing_photos;
CREATE POLICY "photos_delete_own" ON listing_photos FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = listing_photos.listing_id AND l.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "photos_service_role" ON listing_photos;
CREATE POLICY "photos_service_role" ON listing_photos FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Favorites table
CREATE TABLE IF NOT EXISTS favorites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, listing_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id);

ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "favorites_select_own" ON favorites;
CREATE POLICY "favorites_select_own" ON favorites FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorites_insert_own" ON favorites;
CREATE POLICY "favorites_insert_own" ON favorites FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorites_update_own" ON favorites;
CREATE POLICY "favorites_update_own" ON favorites FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "favorites_delete_own" ON favorites;
CREATE POLICY "favorites_delete_own" ON favorites FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Contact requests table
CREATE TABLE IF NOT EXISTS contact_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  requester_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  contact_phone VARCHAR(20) NOT NULL,
  status contact_status_enum DEFAULT 'nouvelle' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_requests_listing ON contact_requests(listing_id);
CREATE INDEX IF NOT EXISTS idx_contact_requests_requester ON contact_requests(requester_id);

ALTER TABLE contact_requests ENABLE ROW LEVEL SECURITY;

-- Requesters see their own requests
DROP POLICY IF EXISTS "contact_select_own" ON contact_requests;
CREATE POLICY "contact_select_own" ON contact_requests FOR SELECT
TO authenticated
USING (auth.uid() = requester_id);

-- Listing owner sees requests for their listings
DROP POLICY IF EXISTS "contact_select_owner" ON contact_requests;
CREATE POLICY "contact_select_owner" ON contact_requests FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = contact_requests.listing_id AND l.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "contact_insert_own" ON contact_requests;
CREATE POLICY "contact_insert_own" ON contact_requests FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "contact_update_owner" ON contact_requests;
CREATE POLICY "contact_update_owner" ON contact_requests FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM listings l WHERE l.id = contact_requests.listing_id AND l.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "contact_service_role" ON contact_requests;
CREATE POLICY "contact_service_role" ON contact_requests FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

/*
# ImoFlex - Properties, Leases, Rent Periods, Payments

## Summary
Creates rental management tables for occupied properties, tenant leases, 
monthly payment cycles, and individual payment transactions.

## Tables
- properties: Activated listings with unique IMO-XXXX access codes
- leases: Active rental contracts (one per tenant at a time)
- rent_periods: Monthly payment cycles per lease
- payments: Individual Mobile Money transactions via Fedapay

## Security
- Properties: owners manage own, all authenticated can read (for access-code lookup)
- Leases: tenants see own, owners see their property's leases
- Rent periods & payments follow lease ownership chain
*/

-- Properties table
CREATE TABLE IF NOT EXISTS properties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  address TEXT NOT NULL,
  monthly_rent INTEGER NOT NULL,
  payment_deadline_day SMALLINT NOT NULL CHECK(payment_deadline_day BETWEEN 1 AND 28),
  access_code VARCHAR(10) UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_properties_owner ON properties(owner_id);
CREATE INDEX IF NOT EXISTS idx_properties_access_code ON properties(access_code);

ALTER TABLE properties ENABLE ROW LEVEL SECURITY;

-- Owner manages their own properties
DROP POLICY IF EXISTS "properties_select_own" ON properties;
CREATE POLICY "properties_select_own" ON properties FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

-- All authenticated can select by access code (needed to join a property)
DROP POLICY IF EXISTS "properties_select_by_code" ON properties;
CREATE POLICY "properties_select_by_code" ON properties FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "properties_insert_own" ON properties;
CREATE POLICY "properties_insert_own" ON properties FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "properties_update_own" ON properties;
CREATE POLICY "properties_update_own" ON properties FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "properties_delete_own" ON properties;
CREATE POLICY "properties_delete_own" ON properties FOR DELETE
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "properties_service_role" ON properties;
CREATE POLICY "properties_service_role" ON properties FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Leases table
CREATE TABLE IF NOT EXISTS leases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
  start_date DATE NOT NULL,
  end_date DATE,
  status lease_status_enum DEFAULT 'actif' NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_leases_tenant ON leases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_leases_property ON leases(property_id);
CREATE INDEX IF NOT EXISTS idx_leases_status ON leases(status);

ALTER TABLE leases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leases_select_tenant" ON leases;
CREATE POLICY "leases_select_tenant" ON leases FOR SELECT
TO authenticated
USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "leases_select_owner" ON leases;
CREATE POLICY "leases_select_owner" ON leases FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM properties p WHERE p.id = leases.property_id AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "leases_insert_tenant" ON leases;
CREATE POLICY "leases_insert_tenant" ON leases FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "leases_update_tenant" ON leases;
CREATE POLICY "leases_update_tenant" ON leases FOR UPDATE
TO authenticated
USING (auth.uid() = tenant_id)
WITH CHECK (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "leases_service_role" ON leases;
CREATE POLICY "leases_service_role" ON leases FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Rent periods table
CREATE TABLE IF NOT EXISTS rent_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lease_id UUID NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
  period_month SMALLINT NOT NULL CHECK(period_month BETWEEN 1 AND 12),
  period_year SMALLINT NOT NULL,
  amount_due INTEGER NOT NULL,
  amount_paid INTEGER DEFAULT 0 NOT NULL,
  deadline_date DATE NOT NULL,
  status rent_period_status_enum DEFAULT 'en_cours' NOT NULL,
  UNIQUE(lease_id, period_month, period_year)
);

CREATE INDEX IF NOT EXISTS idx_rent_periods_lease ON rent_periods(lease_id);
CREATE INDEX IF NOT EXISTS idx_rent_periods_status ON rent_periods(status);

ALTER TABLE rent_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rent_periods_select_tenant" ON rent_periods;
CREATE POLICY "rent_periods_select_tenant" ON rent_periods FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM leases l WHERE l.id = rent_periods.lease_id AND l.tenant_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "rent_periods_select_owner" ON rent_periods;
CREATE POLICY "rent_periods_select_owner" ON rent_periods FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM leases l
    JOIN properties p ON p.id = l.property_id
    WHERE l.id = rent_periods.lease_id AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "rent_periods_insert_tenant" ON rent_periods;
CREATE POLICY "rent_periods_insert_tenant" ON rent_periods FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM leases l WHERE l.id = rent_periods.lease_id AND l.tenant_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "rent_periods_update_tenant" ON rent_periods;
CREATE POLICY "rent_periods_update_tenant" ON rent_periods FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM leases l WHERE l.id = rent_periods.lease_id AND l.tenant_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "rent_periods_service_role" ON rent_periods;
CREATE POLICY "rent_periods_service_role" ON rent_periods FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rent_period_id UUID NOT NULL REFERENCES rent_periods(id) ON DELETE RESTRICT,
  tenant_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK(amount >= 100),
  payment_method payment_method_enum DEFAULT 'mobile_money' NOT NULL,
  operator operator_enum,
  status payment_status_enum DEFAULT 'en_attente' NOT NULL,
  fedapay_transaction_id VARCHAR(100) UNIQUE NOT NULL,
  receipt_url VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  validated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_payments_tenant ON payments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_payments_rent_period ON payments(rent_period_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_tenant" ON payments;
CREATE POLICY "payments_select_tenant" ON payments FOR SELECT
TO authenticated
USING (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "payments_select_owner" ON payments;
CREATE POLICY "payments_select_owner" ON payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM rent_periods rp
    JOIN leases l ON l.id = rp.lease_id
    JOIN properties p ON p.id = l.property_id
    WHERE rp.id = payments.rent_period_id AND p.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "payments_insert_tenant" ON payments;
CREATE POLICY "payments_insert_tenant" ON payments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = tenant_id);

DROP POLICY IF EXISTS "payments_service_role" ON payments;
CREATE POLICY "payments_service_role" ON payments FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

/*
# ImoFlex - Wallets, Withdrawals, Notifications, App Config

## Summary
Creates financial and system tables:
- wallets: One virtual wallet per owner (available/pending/total balance)
- withdrawals: Owner withdrawal requests to Mobile Money
- notifications: In-app notification center for all users
- app_config: Admin-managed global settings (commission rate, fees)

## Initial Data
- commission_rate: 5 (5% taken from each payment)
- attribution_fee: 3000 FCFA flat fee

## Security
- Wallets: owner sees/manages their own only
- Withdrawals: wallet owner sees own
- Notifications: user sees their own
- App config: all can read, service_role manages writes
*/

-- Wallets table
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  available_balance INTEGER DEFAULT 0 NOT NULL,
  pending_balance INTEGER DEFAULT 0 NOT NULL,
  total_earned INTEGER DEFAULT 0 NOT NULL,
  total_withdrawn INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(owner_id)
);

CREATE INDEX IF NOT EXISTS idx_wallets_owner ON wallets(owner_id);

ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wallets_select_own" ON wallets;
CREATE POLICY "wallets_select_own" ON wallets FOR SELECT
TO authenticated
USING (auth.uid() = owner_id);

DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
CREATE POLICY "wallets_insert_own" ON wallets FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
CREATE POLICY "wallets_update_own" ON wallets FOR UPDATE
TO authenticated
USING (auth.uid() = owner_id)
WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "wallets_service_role" ON wallets;
CREATE POLICY "wallets_service_role" ON wallets FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Withdrawals table
CREATE TABLE IF NOT EXISTS withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK(amount > 0),
  operator operator_enum NOT NULL,
  destination_phone VARCHAR(20) NOT NULL,
  status withdrawal_status_enum DEFAULT 'en_traitement' NOT NULL,
  fedapay_payout_id VARCHAR(100) UNIQUE,
  estimated_completion TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_wallet ON withdrawals(wallet_id);

ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "withdrawals_select_own" ON withdrawals;
CREATE POLICY "withdrawals_select_own" ON withdrawals FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM wallets w WHERE w.id = withdrawals.wallet_id AND w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "withdrawals_insert_own" ON withdrawals;
CREATE POLICY "withdrawals_insert_own" ON withdrawals FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM wallets w WHERE w.id = withdrawals.wallet_id AND w.owner_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "withdrawals_service_role" ON withdrawals;
CREATE POLICY "withdrawals_service_role" ON withdrawals FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type_enum NOT NULL,
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_service_role" ON notifications;
CREATE POLICY "notifications_service_role" ON notifications FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- App config table
CREATE TABLE IF NOT EXISTS app_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) UNIQUE NOT NULL,
  value TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Everyone can read config
DROP POLICY IF EXISTS "app_config_select_all" ON app_config;
CREATE POLICY "app_config_select_all" ON app_config FOR SELECT
TO anon, authenticated
USING (true);

-- Only service role (admin via edge function) can modify
DROP POLICY IF EXISTS "app_config_service_role" ON app_config;
CREATE POLICY "app_config_service_role" ON app_config FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Also allow authenticated users to update (admin check in frontend via role)
DROP POLICY IF EXISTS "app_config_update_admin" ON app_config;
CREATE POLICY "app_config_update_admin" ON app_config FOR UPDATE
TO authenticated
USING (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
)
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

DROP POLICY IF EXISTS "app_config_insert_admin" ON app_config;
CREATE POLICY "app_config_insert_admin" ON app_config FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin')
);

-- Insert initial config values
INSERT INTO app_config (key, value) VALUES ('commission_rate', '5')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_config (key, value) VALUES ('attribution_fee', '3000')
ON CONFLICT (key) DO NOTHING;

-- Create Storage bucket for listing photos (if not exists - managed via dashboard)
-- Note: Storage buckets are created via Supabase Dashboard or CLI, not SQL migrations

/*
# Fix: handle_new_user trigger - phone constraint and exception handling

## Problem
The `handle_new_user` trigger fails with "Database error saving new user" because:
1. phone VARCHAR(20) UNIQUE NOT NULL fails when phone metadata is empty
2. Any exception in the trigger causes the entire auth.users INSERT to fail

## Fix
1. Allow phone to be NULL in users table (unique only when provided)
2. Rewrite trigger with EXCEPTION WHEN OTHERS to never block auth signup
3. Use NULLIF so empty string phone becomes NULL
4. Add ON CONFLICT handling for both id AND phone uniqueness
*/

-- Allow phone to be nullable (unique only when not null)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- Drop and recreate the unique index to be NULLS NOT DISTINCT safe
-- (unique constraint already exists - we keep it but phone can now be NULL)

-- Rewrite the trigger function with proper exception handling
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_full_name TEXT;
  v_phone     TEXT;
  v_email     TEXT;
  v_role      user_role;
BEGIN
  v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Utilisateur');
  v_phone     := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  v_email     := NEW.email;
  v_role      := COALESCE(
                   (NULLIF(NEW.raw_user_meta_data->>'role', ''))::user_role,
                   'locataire'
                 );

  INSERT INTO public.users (id, full_name, phone, email, role)
  VALUES (NEW.id, v_full_name, v_phone, v_email, v_role)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = COALESCE(EXCLUDED.email, public.users.email),
        role      = EXCLUDED.role;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never block auth user creation due to profile insert failure
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
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
-- Migration 007 : Correction Policy RLS audit_logs + publication instantanÃ©e
-- Date: 2026-07-08
-- Objectif:
--   1. Ajouter la policy INSERT manquante sur audit_logs (bloquait logAction() silencieusement)
--   2. Aucune modification SQL sur les listings (la correction de Publier.tsx gÃ¨re cela cÃ´tÃ© code)

-- =====================================================================
-- 1. Policy INSERT sur audit_logs
--    Un utilisateur connectÃ© peut insÃ©rer un log UNIQUEMENT pour lui-mÃªme
--    (user_id = son propre auth.uid()), jamais au nom d'un autre.
-- =====================================================================
DROP POLICY IF EXISTS "audit_logs_insert_own" ON audit_logs;
CREATE POLICY "audit_logs_insert_own" ON audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
-- Migration 008 : Commission 6% â€” traÃ§abilitÃ© des revenus ImoFlex
-- Date: 2026-07-08
-- Objectif:
--   1. Ajouter les colonnes commission_amount et commission_rate_applied sur payments
--      â†’ permet de calculer le revenu total ImoFlex via SELECT SUM(commission_amount)
--      â†’ garde une trace du taux appliquÃ© sur chaque transaction historique
--   2. Mettre Ã  jour app_config : passer commission_rate de 5 Ã  6
--      â†’ le webhook lit cette valeur dynamiquement, aucun redÃ©ploiement nÃ©cessaire pour les futurs changements

-- =====================================================================
-- 1. Colonnes de traÃ§abilitÃ© de la commission sur payments
-- =====================================================================
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS commission_amount INTEGER,
  ADD COLUMN IF NOT EXISTS commission_rate_applied NUMERIC(4,2);

-- =====================================================================
-- 2. Mise Ã  jour du taux de commission Ã  6%
-- =====================================================================
UPDATE app_config
SET value = '6', updated_at = NOW()
WHERE key = 'commission_rate';

-- InsÃ©rer la valeur par dÃ©faut si la ligne n'existe pas encore
INSERT INTO app_config (key, value)
VALUES ('commission_rate', '6')
ON CONFLICT (key) DO NOTHING;
-- Migration 009: Fix infinite recursion in users and audit_logs policies
-- Date: 2026-07-11
-- Objectif:
--   1. Ã‰viter l'erreur HTTP 500 (Infinite Recursion) lors de la lecture de la table users.
--   2. CrÃ©er une fonction SECURITY DEFINER pour vÃ©rifier si un utilisateur est admin
--      sans dÃ©clencher les politiques RLS de la table users.
--   3. Mettre Ã  jour les politiques de users et audit_logs pour utiliser cette fonction.

-- =====================================================================
-- 1. Fonction SECURITY DEFINER pour vÃ©rifier le rÃ´le admin
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
-- 2. Nettoyage des anciennes politiques potentiellement rÃ©cursives
-- =====================================================================
DROP POLICY IF EXISTS "users_select_admin" ON users;
DROP POLICY IF EXISTS "audit_logs_select_admin" ON audit_logs;
DROP POLICY IF EXISTS "users_update_admin" ON users;
DROP POLICY IF EXISTS "users_delete_admin" ON users;

-- =====================================================================
-- 3. Nouvelles politiques sÃ©curisÃ©es (sans rÃ©cursion)
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

-- 3. RecrÃ©er les policies standards de base (PropriÃ©taire de son propre compte)
CREATE POLICY "users_select_own" ON users FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON users FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "users_delete_own" ON users FOR DELETE TO authenticated USING (auth.uid() = id);

-- AccÃ¨s complet pour les Edge Functions (service_role)
CREATE POLICY "users_service_role_all" ON users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4. Ajouter les policies pour les administrateurs via is_admin() (Sans rÃ©cursion)
CREATE POLICY "users_select_admin" ON users FOR SELECT TO authenticated USING ( is_admin() );
CREATE POLICY "users_update_admin" ON users FOR UPDATE TO authenticated USING ( is_admin() ) WITH CHECK ( is_admin() );
CREATE POLICY "users_delete_admin" ON users FOR DELETE TO authenticated USING ( is_admin() );

-- 5. Nettoyage similaire pour audit_logs au cas oÃ¹
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
-- Migration 011: Politiques RLS admin pour dashboard complet
-- Date: 2026-07-11
-- Objectif:
--   Les requÃªtes du dashboard admin ont besoin d'accÃ¨s en lecture sur plusieurs tables.
--   On utilise la fonction is_admin() (SECURITY DEFINER) pour Ã©viter toute rÃ©cursion.

-- S'assurer que is_admin() est dÃ©finie (idempotent)
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- â”€â”€ leases â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP POLICY IF EXISTS "leases_select_admin" ON leases;
CREATE POLICY "leases_select_admin" ON leases FOR SELECT
TO authenticated
USING ( is_admin() );

-- â”€â”€ rent_periods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP POLICY IF EXISTS "rent_periods_select_admin" ON rent_periods;
CREATE POLICY "rent_periods_select_admin" ON rent_periods FOR SELECT
TO authenticated
USING ( is_admin() );

-- â”€â”€ payments â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP POLICY IF EXISTS "payments_select_admin" ON payments;
CREATE POLICY "payments_select_admin" ON payments FOR SELECT
TO authenticated
USING ( is_admin() );

-- â”€â”€ contact_requests â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP POLICY IF EXISTS "contact_select_admin" ON contact_requests;
CREATE POLICY "contact_select_admin" ON contact_requests FOR SELECT
TO authenticated
USING ( is_admin() );

-- â”€â”€ withdrawals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP POLICY IF EXISTS "withdrawals_select_admin" ON withdrawals;
CREATE POLICY "withdrawals_select_admin" ON withdrawals FOR SELECT
TO authenticated
USING ( is_admin() );

-- â”€â”€ wallets â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
DROP POLICY IF EXISTS "wallets_select_admin" ON wallets;
CREATE POLICY "wallets_select_admin" ON wallets FOR SELECT
TO authenticated
USING ( is_admin() );

-- â”€â”€ listings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
-- L'admin doit voir toutes les annonces (y compris en_attente/rejetee)
DROP POLICY IF EXISTS "listings_select_admin" ON listings;
CREATE POLICY "listings_select_admin" ON listings FOR SELECT
TO authenticated
USING ( is_admin() );
-- ============================================================
-- Migration 012 : Cron de rÃ©conciliation automatique des paiements
-- NÃ©cessite les extensions pg_cron et pg_net
-- Activables depuis : Supabase Dashboard â†’ Database â†’ Extensions
-- ============================================================

-- Suppression du job si dÃ©jÃ  existant (idempotence)
SELECT cron.unschedule('reconcile-payments-every-10-min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reconcile-payments-every-10-min'
);

SELECT cron.schedule(
  'reconcile-payments-every-10-min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/reconcile-payments?dry_run=false',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- NOTE IMPORTANTE : current_setting('app.settings.service_role_key', true)
-- ne fonctionne que si ce paramÃ¨tre a Ã©tÃ© dÃ©fini au niveau Postgres.
--
-- Option recommandÃ©e (la plus fiable) :
--   1. Aller dans Supabase Dashboard â†’ Database â†’ Vault
--   2. CrÃ©er un secret nommÃ© "service_role_key" avec la valeur
--      de ta clÃ© SERVICE_ROLE (visible dans Project Settings â†’ API)
--   3. Remplacer dans la requÃªte ci-dessus :
--        current_setting('app.settings.service_role_key', true)
--      par :
--        (SELECT decrypted_secret FROM vault.decrypted_secrets
--         WHERE name = 'service_role_key')
--
-- Alternative (plus simple mais moins sÃ©curisÃ©e) :
--   Mettre la clÃ© en dur directement dans le cron (uniquement en dev).
-- ============================================================
-- ============================================================
-- Migration 013 : Verrouillage du statut Ã  l'insertion d'un paiement
--
-- Un tenant ne peut insÃ©rer un paiement qu'avec le statut 'en_attente'.
-- Seul le service_role (Edge Functions) peut passer Ã  'valide'/'echoue'.
-- ============================================================

-- Suppression de l'ancienne policy (sans contrainte de statut)
DROP POLICY IF EXISTS "payments_insert_tenant" ON payments;

-- Nouvelle policy : oblige status = 'en_attente' Ã  l'insertion
CREATE POLICY "payments_insert_tenant" ON payments FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = tenant_id AND status = 'en_attente');
-- ============================================================
-- Migration 014 : Cron quotidien pour la mise Ã  jour des retards
--
-- Appelle l'Edge Function update-overdue-rent-periods chaque nuit
-- Ã  minuit UTC pour passer en 'retard' les pÃ©riodes dÃ©passÃ©es.
--
-- NÃ©cessite : pg_cron + pg_net (Supabase Dashboard â†’ Extensions)
-- ============================================================

-- Suppression idempotente si le job existe dÃ©jÃ 
SELECT cron.unschedule('update-overdue-rent-periods-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'update-overdue-rent-periods-daily'
);

SELECT cron.schedule(
  'update-overdue-rent-periods-daily',
  '0 0 * * *',   -- Tous les jours Ã  00:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/update-overdue-rent-periods',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- NOTE : MÃªme remarque que pour la migration 012 concernant
-- current_setting('app.settings.service_role_key', true).
-- PrÃ©fÃ©rer l'approche Vault pour la sÃ©curitÃ© en production :
--
--   (SELECT decrypted_secret FROM vault.decrypted_secrets
--    WHERE name = 'service_role_key')
-- ============================================================
-- ============================================================
-- Migration 015 : Trigger anti-escalade de rÃ´le
--
-- EmpÃªche tout utilisateur non-admin de modifier son propre rÃ´le
-- directement via UPDATE. Seule une Edge Function (service_role)
-- ou un vrai admin peut changer le champ `role`.
--
-- S'appuie sur is_admin() dÃ©jÃ  dÃ©finie en SECURITY DEFINER
-- (migration 010) â€” pas de risque de rÃ©cursion RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le champ role change ET que l'appelant n'est pas admin â†’ bloquer
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin() THEN
    RAISE EXCEPTION 'Modification du rÃ´le non autorisÃ©e';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON users;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();
-- ============================================================
-- Migration 016 : Suppression des policies d'Ã©criture wallet cÃ´tÃ© client
--
-- Le client React (rÃ´le `authenticated`) ne doit JAMAIS Ã©crire
-- directement dans wallets. Seul service_role (Edge Functions)
-- peut crÃ©er ou modifier un wallet.
--
-- Avant d'appliquer cette migration, s'assurer que l'Edge Function
-- `create-wallet` est dÃ©ployÃ©e â€” sinon la crÃ©ation du premier
-- wallet d'un propriÃ©taire Ã©chouera cÃ´tÃ© client.
--
-- Policies conservÃ©es :
--   - wallets_select_own  : le propriÃ©taire peut lire son wallet
--   - wallets_service_role : les Edge Functions ont accÃ¨s complet
-- ============================================================

-- Suppression des policies d'Ã©criture client
DROP POLICY IF EXISTS "wallets_update_own" ON wallets;
DROP POLICY IF EXISTS "wallets_insert_own" ON wallets;
-- ============================================================
-- Migration 017 : Correction de l'authentification des crons
--
-- Les jobs crÃ©Ã©s en 012 et 014 utilisaient :
--   current_setting('app.settings.service_role_key', true)
-- â†’ jamais configurÃ© â†’ Bearer vide â†’ HTTP 401 silencieux.
--
-- Cette migration dÃ©programme les anciens jobs et les recrÃ©e
-- avec la lecture du secret via vault.decrypted_secrets.
--
-- !! PRÃ‰REQUIS OBLIGATOIRE AVANT D'APPLIQUER !!
-- CrÃ©er le secret dans Dashboard â†’ Database â†’ Vault :
--   Nom exact (sensible Ã  la casse) : service_role_key
--   Valeur : clÃ© service_role (Project Settings â†’ API)
--
-- VÃ©rifier que le secret est bien lisible avant d'appliquer :
--   SELECT name, decrypted_secret IS NOT NULL AS has_value
--   FROM vault.decrypted_secrets
--   WHERE name = 'service_role_key';
-- â†’ doit retourner has_value = true
-- ============================================================

-- ---- Job 1 : reconcile-payments (toutes les 10 min) ----

SELECT cron.unschedule('reconcile-payments-every-10-min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reconcile-payments-every-10-min'
);

SELECT cron.schedule(
  'reconcile-payments-every-10-min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/reconcile-payments?dry_run=false',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---- Job 2 : update-overdue-rent-periods (quotidien 01:00 UTC) ----
-- Note : passage de 00:00 Ã  01:00 UTC pour laisser une marge
-- aprÃ¨s minuit (Afrique de l'Ouest = UTC+0 ou UTC+1)

SELECT cron.unschedule('update-overdue-rent-periods-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'update-overdue-rent-periods-daily'
);

SELECT cron.schedule(
  'update-overdue-rent-periods-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/update-overdue-rent-periods',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- VÃ©rification aprÃ¨s application :
--
-- 1. Jobs enregistrÃ©s :
--    SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
--
-- 2. AprÃ¨s le prochain cycle (~10 min pour reconcile) :
--    SELECT jobname, status, return_message, start_time
--    FROM cron.job_run_details
--    ORDER BY start_time DESC
--    LIMIT 10;
--    â†’ status doit Ãªtre 'succeeded' pour les deux jobs
-- ============================================================
/*
# ImoFlex - Allow owners to read their tenants' basic info

## Problem
The users table RLS only allows users to read their own row (auth.uid() = id).
When a landlord (propriÃ©taire) loads the FicheBail screen, Supabase performs a
JOIN on users to get the tenant's full_name and phone. This join returns NULL
because the RLS blocks the landlord from reading another user's row.

## Fix
Add a SELECT policy that allows a landlord to read a user's row
IF that user is a tenant on one of the landlord's properties.
The check uses the lease â†’ property â†’ owner chain already established
in the payments_select_owner policy.
*/

-- Allow owners to read their tenants' basic profile info
DROP POLICY IF EXISTS "users_select_as_owner" ON users;
CREATE POLICY "users_select_as_owner" ON users FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM leases l
    JOIN properties p ON p.id = l.property_id
    WHERE l.tenant_id = users.id
      AND p.owner_id = auth.uid()
  )
);
/*
  Migration: 20260718000002_019_admin_system_health.sql
  Description: CrÃ©e une fonction RPC lisant `cron.job_run_details`.
  Strictement rÃ©servÃ©e au rÃ´le `service_role`.
*/

CREATE OR REPLACE FUNCTION public.admin_get_cron_health()
RETURNS TABLE (
  jobname text,
  status text,
  start_time timestamp with time zone,
  return_message text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.jobname, d.status, d.start_time, d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.start_time > now() - interval '30 hours'
  ORDER BY d.start_time DESC;
$$;

-- RÃ©vocation de toutes les permissions publiques/authentifiÃ©es
REVOKE EXECUTE ON FUNCTION public.admin_get_cron_health() FROM PUBLIC, authenticated, anon;

-- Octroi de la permission exclusivement au rÃ´le de service
GRANT EXECUTE ON FUNCTION public.admin_get_cron_health() TO service_role;
/*
  Migration: 20260718000003_020_fix_cron_health_window.sql
  Description: Ã‰tend la fenÃªtre de lecture de cron.job_run_details Ã  30h
  pour couvrir le cron daily (update-overdue-rent-periods) qui tourne
  Ã  01h00 UTC et serait invisible avec la fenÃªtre prÃ©cÃ©dente de 2h.
*/

CREATE OR REPLACE FUNCTION public.admin_get_cron_health()
RETURNS TABLE (
  jobname text,
  status text,
  start_time timestamp with time zone,
  return_message text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.jobname, d.status, d.start_time, d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.start_time > now() - interval '30 hours'
  ORDER BY d.start_time DESC;
$$;

-- Permissions inchangÃ©es â€” on s'assure qu'elles sont toujours en place
REVOKE EXECUTE ON FUNCTION public.admin_get_cron_health() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_cron_health() TO service_role;
-- 1. Ajouter la colonne avatar_url Ã  la table users
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. CrÃ©er le bucket 'avatars' s'il n'existe pas (accÃ¨s public en lecture)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Politiques (Policies) pour le bucket 'avatars'

-- Lecture publique (tout le monde peut voir les avatars)
DROP POLICY IF EXISTS "Avatar public access" ON storage.objects;
CREATE POLICY "Avatar public access" ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');

-- Upload restreint Ã  l'utilisateur authentifiÃ©
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Permettre la modification (Ã©crasement) de son propre avatar
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Permettre la suppression de son propre avatar
DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'avatars' 
  AND (storage.foldername(name))[1] = auth.uid()::text
);
/*
# Fix: handle_new_user() â€” ajout du SET search_path manquant

## ProblÃ¨me
La fonction `handle_new_user()` s'exÃ©cute depuis le contexte `auth` (via trigger sur auth.users).
Sans `SET search_path = public`, le cast `::user_role` Ã©choue car le type n'est pas visible,
causant l'erreur "Database error saving new user" Ã  l'inscription.

Diagnostic confirmÃ© : proconfig = null (search_path absent) alors que user_role existe bien dans public.

## Correction
RecrÃ©ation de la fonction avec `SET search_path = public, auth` en clause RETURNS TRIGGER.
Logique mÃ©tier identique Ã  la migration 005 â€” seul le search_path est ajoutÃ©.
prosecdef conservÃ© : SECURITY DEFINER (prosecdef = true confirmÃ© en prod).
*/

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_full_name TEXT;
  v_phone     TEXT;
  v_email     TEXT;
  v_role      user_role;
BEGIN
  v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Utilisateur');
  v_phone     := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  v_email     := NEW.email;
  v_role      := COALESCE(
                   (NULLIF(NEW.raw_user_meta_data->>'role', ''))::user_role,
                   'locataire'
                 );

  INSERT INTO public.users (id, full_name, phone, email, role)
  VALUES (NEW.id, v_full_name, v_phone, v_email, v_role)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email     = COALESCE(EXCLUDED.email, public.users.email),
        role      = EXCLUDED.role;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne jamais bloquer la crÃ©ation auth.users en cas d'Ã©chec du profil
  RETURN NEW;
END;
$$;
-- Ajouter la colonne related_id pour lier une notification Ã  son Ã©vÃ©nement (paiement, retrait, demande)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS related_id UUID;

-- CrÃ©er un index pour optimiser les requÃªtes si nÃ©cessaire (bien que l'accÃ¨s principal soit par user_id)
CREATE INDEX IF NOT EXISTS idx_notifications_related_id ON notifications(related_id);
-- Ajouter la colonne idempotency_key Ã  payments
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS idempotency_key UUID UNIQUE;

-- RPC pour gÃ©rer atomiquement la validation du paiement et la mise Ã  jour des wallets
CREATE OR REPLACE FUNCTION public.process_payment_webhook(p_fedapay_tx_id TEXT, p_event_type TEXT)
RETURNS json AS $$
DECLARE
    v_payment record;
    v_rent_period record;
    v_owner_id uuid;
    v_tenant_id uuid;
    v_commission_rate numeric;
    v_owner_amount numeric;
    v_commission_amount numeric;
    v_new_amount_paid numeric;
    v_new_rp_status text;
    v_wallet record;
BEGIN
    -- 1. Verrouiller le paiement (Lock payment)
    SELECT p.* INTO v_payment
    FROM public.payments p
    WHERE p.fedapay_transaction_id = p_fedapay_tx_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paiement introuvable';
    END IF;

    -- Idempotence: si dÃ©jÃ  traitÃ©, on s'arrÃªte lÃ 
    IF v_payment.status IN ('valide', 'echoue') THEN
        RETURN json_build_object(
            'status', 'already_processed',
            'payment_id', v_payment.id
        );
    END IF;
    
    v_tenant_id := v_payment.tenant_id;

    -- Gestion du refus
    IF p_event_type = 'transaction.declined' THEN
        UPDATE public.payments SET status = 'echoue' WHERE id = v_payment.id;
        RETURN json_build_object(
            'status', 'declined',
            'payment_id', v_payment.id,
            'tenant_id', v_tenant_id,
            'amount', v_payment.amount
        );
    END IF;

    IF p_event_type != 'transaction.approved' THEN
        RAISE EXCEPTION 'Event type non supportÃ© par ce RPC';
    END IF;

    -- 2. RÃ©cupÃ©rer rent_period et owner_id avec verrous
    SELECT rp.* INTO v_rent_period
    FROM public.rent_periods rp
    WHERE rp.id = v_payment.rent_period_id
    FOR UPDATE;

    SELECT pr.owner_id INTO v_owner_id
    FROM public.properties pr
    JOIN public.leases l ON l.property_id = pr.id
    WHERE l.id = v_rent_period.lease_id;

    -- 3. Calcul de la commission avec arrondi
    SELECT COALESCE((SELECT value::numeric FROM public.app_config WHERE key = 'commission_rate'), 6) INTO v_commission_rate;
    
    v_owner_amount := ROUND(v_payment.amount * (1.0 - (v_commission_rate / 100.0)), 0);
    v_commission_amount := v_payment.amount - v_owner_amount;

    -- 4. Update payments
    UPDATE public.payments 
    SET status = 'valide', 
        validated_at = NOW(),
        commission_amount = v_commission_amount,
        commission_rate_applied = v_commission_rate
    WHERE id = v_payment.id;

    -- 5. Update rent_periods
    v_new_amount_paid := COALESCE(v_rent_period.amount_paid, 0) + v_payment.amount;
    IF v_new_amount_paid >= v_rent_period.amount_due THEN
        v_new_rp_status := 'solde';
    ELSE
        v_new_rp_status := 'en_cours';
    END IF;

    UPDATE public.rent_periods
    SET amount_paid = v_new_amount_paid,
        status = v_new_rp_status
    WHERE id = v_rent_period.id;

    -- 6. Update or Create wallet
    IF v_owner_id IS NOT NULL THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE owner_id = v_owner_id FOR UPDATE;
        IF FOUND THEN
            UPDATE public.wallets 
            SET available_balance = available_balance + v_owner_amount,
                total_earned = total_earned + v_owner_amount
            WHERE id = v_wallet.id;
        ELSE
            INSERT INTO public.wallets (owner_id, available_balance, total_earned, total_withdrawn)
            VALUES (v_owner_id, v_owner_amount, v_owner_amount, 0);
        END IF;
    END IF;

    -- Return context pour les notifications cÃ´tÃ© Deno
    RETURN json_build_object(
        'status', 'approved',
        'payment_id', v_payment.id,
        'owner_id', v_owner_id,
        'tenant_id', v_tenant_id,
        'amount', v_payment.amount,
        'owner_amount', v_owner_amount,
        'commission_rate', v_commission_rate
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
-- 1. CrÃ©ation de la table financial_ledger
CREATE TABLE IF NOT EXISTS public.financial_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
    reference_type TEXT NOT NULL CHECK (reference_type IN ('payment', 'withdrawal')),
    reference_id UUID NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('credit', 'debit')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    balance_after NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.financial_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Les proprietaires peuvent voir leur ledger"
    ON public.financial_ledger FOR SELECT
    TO authenticated
    USING (
        wallet_id IN (
            SELECT id FROM public.wallets WHERE owner_id = auth.uid()
        )
    );

-- 2. Machine d'Ã©tat stricte pour la table payments
CREATE OR REPLACE FUNCTION public.prevent_invalid_payment_state_transitions()
RETURNS trigger AS $$
BEGIN
    IF OLD.status IN ('valide', 'echoue') AND NEW.status != OLD.status THEN
        RAISE EXCEPTION 'Transition de statut invalide : impossible de modifier un paiement % en %', OLD.status, NEW.status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_prevent_invalid_payment_state_transitions ON public.payments;
CREATE TRIGGER tr_prevent_invalid_payment_state_transitions
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.prevent_invalid_payment_state_transitions();


-- 3. Mise Ã  jour de process_payment_webhook pour y inclure le Ledger
CREATE OR REPLACE FUNCTION public.process_payment_webhook(p_fedapay_tx_id TEXT, p_event_type TEXT)
RETURNS json AS $$
DECLARE
    v_payment record;
    v_rent_period record;
    v_owner_id uuid;
    v_tenant_id uuid;
    v_commission_rate numeric;
    v_owner_amount numeric;
    v_commission_amount numeric;
    v_new_amount_paid numeric;
    v_new_rp_status text;
    v_wallet record;
BEGIN
    -- 1. Verrouiller le paiement
    SELECT p.* INTO v_payment
    FROM public.payments p
    WHERE p.fedapay_transaction_id = p_fedapay_tx_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Paiement introuvable';
    END IF;

    -- Idempotence
    IF v_payment.status IN ('valide', 'echoue') THEN
        RETURN json_build_object(
            'status', 'already_processed',
            'payment_id', v_payment.id
        );
    END IF;
    
    v_tenant_id := v_payment.tenant_id;

    -- Gestion du refus
    IF p_event_type = 'transaction.declined' THEN
        UPDATE public.payments SET status = 'echoue' WHERE id = v_payment.id;
        RETURN json_build_object(
            'status', 'declined',
            'payment_id', v_payment.id,
            'tenant_id', v_tenant_id,
            'amount', v_payment.amount
        );
    END IF;

    IF p_event_type != 'transaction.approved' THEN
        RAISE EXCEPTION 'Event type non supportÃ© par ce RPC';
    END IF;

    -- 2. RÃ©cupÃ©rer rent_period et owner_id avec verrous
    SELECT rp.* INTO v_rent_period
    FROM public.rent_periods rp
    WHERE rp.id = v_payment.rent_period_id
    FOR UPDATE;

    SELECT pr.owner_id INTO v_owner_id
    FROM public.properties pr
    JOIN public.leases l ON l.property_id = pr.id
    WHERE l.id = v_rent_period.lease_id;

    -- 3. Calcul de la commission avec arrondi
    SELECT COALESCE((SELECT value::numeric FROM public.app_config WHERE key = 'commission_rate'), 6) INTO v_commission_rate;
    
    v_owner_amount := ROUND(v_payment.amount * (1.0 - (v_commission_rate / 100.0)), 0);
    v_commission_amount := v_payment.amount - v_owner_amount;

    -- 4. Update payments
    UPDATE public.payments 
    SET status = 'valide', 
        validated_at = NOW(),
        commission_amount = v_commission_amount,
        commission_rate_applied = v_commission_rate
    WHERE id = v_payment.id;

    -- 5. Update rent_periods
    v_new_amount_paid := COALESCE(v_rent_period.amount_paid, 0) + v_payment.amount;
    IF v_new_amount_paid >= v_rent_period.amount_due THEN
        v_new_rp_status := 'solde';
    ELSE
        v_new_rp_status := 'en_cours';
    END IF;

    UPDATE public.rent_periods
    SET amount_paid = v_new_amount_paid,
        status = v_new_rp_status
    WHERE id = v_rent_period.id;

    -- 6. Update or Create wallet + Insertion dans le Ledger
    IF v_owner_id IS NOT NULL THEN
        SELECT * INTO v_wallet FROM public.wallets WHERE owner_id = v_owner_id FOR UPDATE;
        IF FOUND THEN
            UPDATE public.wallets 
            SET available_balance = available_balance + v_owner_amount,
                total_earned = total_earned + v_owner_amount
            WHERE id = v_wallet.id
            RETURNING id, available_balance INTO v_wallet;
        ELSE
            INSERT INTO public.wallets (owner_id, available_balance, total_earned, total_withdrawn)
            VALUES (v_owner_id, v_owner_amount, v_owner_amount, 0)
            RETURNING id, available_balance INTO v_wallet;
        END IF;

        -- Insertion de l'Ã©criture comptable
        INSERT INTO public.financial_ledger (
            wallet_id, reference_type, reference_id, entry_type, amount, balance_after
        ) VALUES (
            v_wallet.id, 'payment', v_payment.id, 'credit', v_owner_amount, v_wallet.available_balance
        );
    END IF;

    RETURN json_build_object(
        'status', 'approved',
        'payment_id', v_payment.id,
        'owner_id', v_owner_id,
        'tenant_id', v_tenant_id,
        'amount', v_payment.amount,
        'owner_amount', v_owner_amount,
        'commission_rate', v_commission_rate
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. Modification de l'intervalle du cron de 10 min Ã  5 min
SELECT cron.unschedule('reconcile-payments-every-10-min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reconcile-payments-every-10-min'
);

SELECT cron.unschedule('reconcile-payments-every-5-min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reconcile-payments-every-5-min'
);

SELECT cron.schedule(
  'reconcile-payments-every-5-min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/reconcile-payments?dry_run=false',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || COALESCE(
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
          current_setting('app.settings.service_role_key', true)
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
-- ============================================================
-- Migration 026 : Rate Limiting natif Postgres
-- ProtÃ¨ge les endpoints financiers contre les abus
-- ============================================================

-- 1. Table de journalisation des appels API
CREATE TABLE IF NOT EXISTS public.rate_limit_log (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL,
    endpoint    TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index compound pour que la fenÃªtre glissante soit ultra-rapide
CREATE INDEX IF NOT EXISTS idx_rate_limit_log_user_endpoint_created
    ON public.rate_limit_log (user_id, endpoint, created_at DESC);

-- Pas de RLS : table interne, jamais exposÃ©e au client
-- L'accÃ¨s est contrÃ´lÃ© par les permissions de la fonction RPC ci-dessous

-- 2. Fonction RPC check_rate_limit
-- Retourne TRUE si l'appel est autorisÃ©, FALSE si le seuil est dÃ©passÃ©.
-- En mode autorisÃ©, insÃ¨re le log atomiquement.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_user_id       UUID,
    p_endpoint      TEXT,
    p_max_requests  INT,
    p_window_seconds INT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_count INT;
BEGIN
    -- Purge des entrÃ©es de plus de 1 heure pour Ã©viter la croissance infinie de la table
    DELETE FROM public.rate_limit_log
    WHERE created_at < NOW() - INTERVAL '1 hour';

    -- Comptage dans la fenÃªtre glissante
    SELECT COUNT(*) INTO v_count
    FROM public.rate_limit_log
    WHERE user_id = p_user_id
      AND endpoint = p_endpoint
      AND created_at > NOW() - (p_window_seconds || ' seconds')::interval;

    IF v_count >= p_max_requests THEN
        RETURN false;
    END IF;

    -- AutorisÃ© : on enregistre l'appel
    INSERT INTO public.rate_limit_log (user_id, endpoint, created_at)
    VALUES (p_user_id, p_endpoint, NOW());

    RETURN true;
END;
$$;

-- 3. SÃ©curisation stricte : seul service_role peut appeler cette fonction
REVOKE ALL ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(UUID, TEXT, INT, INT) TO service_role;

-- 4. La table rate_limit_log est Ã©galement inaccessible hors service_role
REVOKE ALL ON TABLE public.rate_limit_log FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limit_log TO service_role;
GRANT USAGE ON SEQUENCE public.rate_limit_log_id_seq TO service_role;
