
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
