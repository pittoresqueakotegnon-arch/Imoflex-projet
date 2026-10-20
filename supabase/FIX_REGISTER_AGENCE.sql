-- =============================================================================
-- FIX : Prise en compte du rôle 'agence' et résolution de "Database error saving new user"
-- =============================================================================

CREATE OR REPLACE FUNCTION public.profile_values_from_auth_user(p_user_id uuid)
 RETURNS TABLE(full_name text, phone text, email text, role user_role)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_auth_user auth.users%ROWTYPE;
  v_phone TEXT;
  v_email TEXT;
  v_role public.user_role;
BEGIN
  SELECT * INTO v_auth_user
  FROM auth.users
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte Auth introuvable';
  END IF;

  v_phone := NULLIF(TRIM(v_auth_user.raw_user_meta_data->>'phone'), '');
  v_email := v_auth_user.email;
  
  -- 1. Prise en compte explicite de 'agence' en plus de 'locataire' et 'proprietaire'
  v_role := CASE
    WHEN v_auth_user.raw_user_meta_data->>'role' IN ('locataire', 'proprietaire', 'agence')
      THEN (v_auth_user.raw_user_meta_data->>'role')::public.user_role
    ELSE 'locataire'::public.user_role
  END;

  -- 2. Protection contre l'erreur de contrainte unique sur le numéro de téléphone
  IF v_phone IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.phone = v_phone AND u.id <> p_user_id
  ) THEN
    v_phone := NULL;
  END IF;

  -- 3. Protection contre l'erreur de contrainte unique sur l'email
  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.email = v_email AND u.id <> p_user_id
  ) THEN
    -- Supprime l'ancien profil orphelin s'il n'est plus dans auth.users
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = v_email AND id <> p_user_id) THEN
      DELETE FROM public.users WHERE email = v_email AND id <> p_user_id;
    END IF;
  END IF;

  RETURN QUERY SELECT
    COALESCE(NULLIF(v_auth_user.raw_user_meta_data->>'full_name', ''), 'Utilisateur'),
    v_phone,
    v_email,
    v_role;
END;
$function$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_profile RECORD;
BEGIN
  SELECT * INTO v_profile
  FROM public.profile_values_from_auth_user(NEW.id);

  INSERT INTO public.users (id, full_name, phone, email, role)
  VALUES (NEW.id, v_profile.full_name, v_profile.phone, v_profile.email, v_profile.role)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        email = COALESCE(EXCLUDED.email, public.users.email);

  -- Initialisation automatique dans agences_profiles si le rôle est agence
  IF v_profile.role = 'agence' THEN
    INSERT INTO public.agences_profiles (id, nom_agence, email_contact, phone_agence)
    VALUES (NEW.id, v_profile.full_name, v_profile.email, v_profile.phone)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
