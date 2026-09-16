-- ============================================================================
-- Migration 046 : finalisation fiable des inscriptions Auth
-- ============================================================================
-- Une ancienne version du trigger absorbait toutes les erreurs. Un compte
-- pouvait donc exister dans auth.users sans ligne correspondante dans
-- public.users, ce qui rendait la connexion applicative impossible.

BEGIN;

CREATE OR REPLACE FUNCTION public.profile_values_from_auth_user(p_user_id UUID)
RETURNS TABLE (full_name TEXT, phone TEXT, email TEXT, role public.user_role)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_auth_user auth.users%ROWTYPE;
  v_phone TEXT;
  v_role public.user_role;
BEGIN
  SELECT * INTO v_auth_user
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte Auth introuvable';
  END IF;

  v_phone := NULLIF(TRIM(v_auth_user.raw_user_meta_data->>'phone'), '');
  v_role := CASE
    WHEN v_auth_user.raw_user_meta_data->>'role' IN ('locataire', 'proprietaire')
      THEN (v_auth_user.raw_user_meta_data->>'role')::public.user_role
    ELSE 'locataire'::public.user_role
  END;

  -- Le numéro reste unique. Un doublon ne doit cependant jamais empêcher la
  -- création du profil : il sera laissé vide et l'utilisateur pourra renseigner
  -- un numéro différent dans son profil après connexion.
  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.phone = v_phone AND u.id <> p_user_id
  ) THEN
    v_phone := NULL;
  END IF;

  RETURN QUERY SELECT
    COALESCE(NULLIF(v_auth_user.raw_user_meta_data->>'full_name', ''), 'Utilisateur'),
    v_phone,
    v_auth_user.email,
    v_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile
  FROM public.profile_values_from_auth_user(NEW.id);

  INSERT INTO public.users (id, full_name, phone, email, role)
  VALUES (NEW.id, v_profile.full_name, v_profile.phone, v_profile.email, v_profile.role)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = COALESCE(EXCLUDED.email, public.users.email);

  RETURN NEW;
END;
$$;

-- Répare de façon limitée le profil de la personne déjà authentifiée. Aucun
-- paramètre utilisateur n'est accepté et un rôle admin ne peut jamais résulter
-- des métadonnées d'inscription.
CREATE OR REPLACE FUNCTION public.ensure_current_user_profile()
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile RECORD;
  v_result public.users%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  SELECT * INTO v_result
  FROM public.users
  WHERE id = v_user_id;

  IF FOUND THEN
    RETURN v_result;
  END IF;

  SELECT * INTO v_profile
  FROM public.profile_values_from_auth_user(v_user_id);

  INSERT INTO public.users (id, full_name, phone, email, role)
  VALUES (v_user_id, v_profile.full_name, v_profile.phone, v_profile.email, v_profile.role)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = COALESCE(EXCLUDED.email, public.users.email)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.profile_values_from_auth_user(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_current_user_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_current_user_profile() TO authenticated;

COMMIT;
