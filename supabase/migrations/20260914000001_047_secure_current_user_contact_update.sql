-- ============================================================================
-- Migration 047 : mise à jour sûre des coordonnées du profil
-- ============================================================================
-- La modification directe de phone conserverait à tort phone_verified = true.
-- Cette RPC ne modifie que le profil de la session courante et invalide la
-- vérification si le numéro change.

BEGIN;

REVOKE UPDATE (full_name, phone) ON TABLE public.users FROM authenticated;

CREATE OR REPLACE FUNCTION public.update_current_user_contact(
  p_full_name TEXT,
  p_phone TEXT
)
RETURNS public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_full_name TEXT := regexp_replace(trim(COALESCE(p_full_name, '')), '\s+', ' ', 'g');
  v_phone_digits TEXT := regexp_replace(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_phone TEXT;
  v_result public.users%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentification requise';
  END IF;

  IF char_length(v_full_name) NOT BETWEEN 2 AND 150 THEN
    RAISE EXCEPTION 'Le nom doit contenir entre 2 et 150 caractères';
  END IF;

  IF v_phone_digits !~ '^[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide';
  END IF;
  v_phone := '+' || v_phone_digits;

  IF EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.phone = v_phone
      AND u.id <> v_user_id
  ) THEN
    RAISE EXCEPTION 'Ce numéro est déjà utilisé';
  END IF;

  UPDATE public.users u
  SET full_name = v_full_name,
      phone = v_phone,
      phone_verified = CASE
        WHEN u.phone IS DISTINCT FROM v_phone THEN false
        ELSE u.phone_verified
      END
  WHERE u.id = v_user_id
  RETURNING * INTO v_result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil utilisateur introuvable';
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_current_user_contact(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_current_user_contact(TEXT, TEXT) TO authenticated;

COMMIT;
