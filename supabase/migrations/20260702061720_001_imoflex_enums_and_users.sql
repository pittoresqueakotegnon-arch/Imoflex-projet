
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
