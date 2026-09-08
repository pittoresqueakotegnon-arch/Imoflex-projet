
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
