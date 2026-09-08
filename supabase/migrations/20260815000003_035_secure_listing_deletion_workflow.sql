-- ============================================================================
-- Migration 035: Sécuriser le workflow de suppression d'annonces
--
-- PROBLÈME 1 : listings_update_own (migration 002) autorise un propriétaire à
-- faire directement UPDATE listings SET status='supprimee' en contournant
-- le workflow de validation admin.
--
-- PROBLÈME 2 : listings_delete_own (migration 002) autorise un DELETE physique
-- qui casserait l'intégrité référentielle (listing_deletion_requests, photos,
-- contact_requests liés à l'annonce).
--
-- SOLUTION :
--   1. Trigger AFTER INSERT sur listing_deletion_requests (SECURITY DEFINER)
--      qui passe automatiquement l'annonce en 'suppression_demandee'.
--   2. RPC SECURITY DEFINER approve_listing_deletion() pour valider côté admin
--      et passer en 'supprimee'.
--   3. Trigger BEFORE UPDATE sur listings qui bloque toute transition directe
--      vers 'suppression_demandee' ou 'supprimee' initiée hors service_role/triggers.
--   4. Suppression de listings_delete_own (interdit le DELETE physique client).
-- ============================================================================

-- ── 1. RPC approve_listing_deletion (SECURITY DEFINER) ───────────────────────
-- Approuve une demande de suppression et soft-delete l'annonce de manière atomique.

CREATE OR REPLACE FUNCTION public.approve_listing_deletion(
  p_request_id  UUID,
  p_admin_id    UUID,
  p_listing_id  UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_role TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- Vérifier que l'appelant est bien administrateur
  SELECT role INTO v_admin_role FROM users WHERE id = p_admin_id;
  IF v_admin_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Action réservée aux administrateurs.';
  END IF;

  -- Mettre à jour la demande de suppression
  UPDATE listing_deletion_requests
  SET status      = 'approved',
      admin_id    = p_admin_id,
      reviewed_at = v_now
  WHERE id = p_request_id;

  -- Soft-delete de l'annonce
  UPDATE listings
  SET status       = 'supprimee',
      is_published = false,
      moderated_at = v_now,
      moderated_by = p_admin_id
  WHERE id = p_listing_id;
END;
$$;

-- ── 2. Trigger automatique à la création d'une demande ────────────────────────
-- Quand un propriétaire soumet une demande, l'annonce passe automatiquement
-- en 'suppression_demandee' via ce trigger privilégié (SECURITY DEFINER).

CREATE OR REPLACE FUNCTION public.fn_on_listing_deletion_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.listings
  SET status = 'suppression_demandee'
  WHERE id = NEW.listing_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_listing_deletion_requested ON public.listing_deletion_requests;
CREATE TRIGGER trg_on_listing_deletion_requested
  AFTER INSERT ON public.listing_deletion_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_on_listing_deletion_requested();

-- ── 3. Trigger de garde : interdire les modifications directes de statut ──────
-- Empêche un utilisateur (client standard) de modifier directement le statut vers
-- 'suppression_demandee' ou 'supprimee' sans passer par les mécanismes ci-dessus.

CREATE OR REPLACE FUNCTION public.prevent_direct_listing_deletion_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('suppression_demandee', 'supprimee')
     AND OLD.status IS DISTINCT FROM NEW.status
     AND current_setting('request.jwt.claims', true)::json->>'role' IS DISTINCT FROM 'service_role'
  THEN
    RAISE EXCEPTION
      'Transition de statut non autorisée : cette action doit passer par le workflow de demande de suppression.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_direct_listing_deletion ON public.listings;
CREATE TRIGGER trg_prevent_direct_listing_deletion
  BEFORE UPDATE ON public.listings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_direct_listing_deletion_status();

-- ── 4. Supprimer listings_delete_own (soft-delete obligatoire) ────────────────

DROP POLICY IF EXISTS "listings_delete_own" ON public.listings;
