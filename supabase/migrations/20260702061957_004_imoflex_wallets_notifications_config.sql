
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
