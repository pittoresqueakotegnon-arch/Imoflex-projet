-- ============================================================
-- Migration 015 : Trigger anti-escalade de rôle
--
-- Empêche tout utilisateur non-admin de modifier son propre rôle
-- directement via UPDATE. Seule une Edge Function (service_role)
-- ou un vrai admin peut changer le champ `role`.
--
-- S'appuie sur is_admin() déjà définie en SECURITY DEFINER
-- (migration 010) — pas de risque de récursion RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_role_self_escalation()
RETURNS TRIGGER AS $$
BEGIN
  -- Si le champ role change ET que l'appelant n'est pas admin → bloquer
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin() THEN
    RAISE EXCEPTION 'Modification du rôle non autorisée';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON users;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();
