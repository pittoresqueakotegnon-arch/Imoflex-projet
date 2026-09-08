/*
# Fix: handle_new_user() — ajout du SET search_path manquant

## Problème
La fonction `handle_new_user()` s'exécute depuis le contexte `auth` (via trigger sur auth.users).
Sans `SET search_path = public`, le cast `::user_role` échoue car le type n'est pas visible,
causant l'erreur "Database error saving new user" à l'inscription.

Diagnostic confirmé : proconfig = null (search_path absent) alors que user_role existe bien dans public.

## Correction
Recréation de la fonction avec `SET search_path = public, auth` en clause RETURNS TRIGGER.
Logique métier identique à la migration 005 — seul le search_path est ajouté.
prosecdef conservé : SECURITY DEFINER (prosecdef = true confirmé en prod).
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
  -- Ne jamais bloquer la création auth.users en cas d'échec du profil
  RETURN NEW;
END;
$$;
