-- ============================================================================
-- Migration 040 : empêcher toute élévation de privilèges par le profil client
-- ============================================================================

BEGIN;

-- Le profil est créé uniquement depuis le trigger auth. Supprimer ces policies
-- empêche un client de créer un profil arbitraire ou de supprimer son profil
-- public en laissant son compte auth orphelin.
DROP POLICY IF EXISTS "users_insert_own" ON public.users;
DROP POLICY IF EXISTS "users_delete_own" ON public.users;

-- La policy de ligne reste nécessaire pour les champs personnels, mais les
-- privilèges de colonnes ci-dessous empêchent de modifier role, is_active,
-- account_status ou phone_verified depuis PostgREST.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.users FROM PUBLIC, anon, authenticated;
GRANT UPDATE (
  full_name,
  phone,
  mobile_money_number,
  preferred_operator,
  avatar_url,
  fcm_token
) ON TABLE public.users TO authenticated;

-- Les métadonnées auth sont contrôlées par le client lors de l'inscription :
-- ne jamais en déduire un rôle admin. Le trigger ne met jamais à jour le rôle
-- d'un profil existant.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_full_name TEXT;
  v_phone TEXT;
  v_role public.user_role;
BEGIN
  v_full_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), 'Utilisateur');
  v_phone := NULLIF(TRIM(NEW.raw_user_meta_data->>'phone'), '');
  v_role := CASE
    WHEN NEW.raw_user_meta_data->>'role' IN ('locataire', 'proprietaire')
      THEN (NEW.raw_user_meta_data->>'role')::public.user_role
    ELSE 'locataire'::public.user_role
  END;

  INSERT INTO public.users (id, full_name, phone, email, role)
  VALUES (NEW.id, v_full_name, v_phone, NEW.email, v_role)
  ON CONFLICT (id) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = COALESCE(EXCLUDED.email, public.users.email);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Ne pas empêcher la création du compte auth si un profil existant a un
  -- téléphone identique. L'incident doit alors être résolu côté support.
  RETURN NEW;
END;
$$;

-- Toute action sensible sur un autre compte est exécutée côté base après une
-- vérification d'admin. L'interface ne peut ni se promouvoir, ni promouvoir
-- quelqu'un en administrateur.
CREATE OR REPLACE FUNCTION public.admin_update_user_account(
  p_target_user_id UUID,
  p_new_role public.user_role DEFAULT NULL,
  p_new_status public.account_status_enum DEFAULT NULL
)
RETURNS TABLE (id UUID, role public.user_role, account_status public.account_status_enum, is_active BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès administrateur requis';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Un administrateur ne peut pas modifier son propre accès ici';
  END IF;

  IF p_new_role = 'admin' THEN
    RAISE EXCEPTION 'La promotion administrateur doit être effectuée hors de l''application';
  END IF;

  IF p_new_role IS NULL AND p_new_status IS NULL THEN
    RAISE EXCEPTION 'Aucune modification demandée';
  END IF;

  RETURN QUERY
  UPDATE public.users u
  SET role = COALESCE(p_new_role, u.role),
      account_status = COALESCE(p_new_status, u.account_status),
      is_active = CASE
        WHEN p_new_status IS NULL THEN u.is_active
        WHEN p_new_status = 'actif' THEN true
        ELSE false
      END
  WHERE u.id = p_target_user_id
  RETURNING u.id, u.role, u.account_status, u.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_user_account(UUID, public.user_role, public.account_status_enum) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_account(UUID, public.user_role, public.account_status_enum) TO authenticated;

COMMIT;
