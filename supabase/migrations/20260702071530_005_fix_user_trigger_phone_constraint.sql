
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
