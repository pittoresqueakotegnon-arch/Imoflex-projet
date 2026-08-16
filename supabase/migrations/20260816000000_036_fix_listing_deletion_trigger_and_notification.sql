-- ============================================================================
-- Migration 036: Correction du trigger de suppression et notification admin
--
-- PROBLÈME :
-- Le trigger `trg_prevent_direct_listing_deletion` sur `listings` bloquait
-- le passage automatique en 'suppression_demandee' déclenché lors de l'insert
-- dans `listing_deletion_requests` car le rôle JWT de l'utilisateur n'est pas 'service_role'.
--
-- SOLUTION :
-- 1. Corriger `prevent_direct_listing_deletion_status()` pour autoriser la transition
--    vers 'suppression_demandee' dès lors qu'une demande en attente existe pour l'annonce.
-- 2. Améliorer `fn_on_listing_deletion_requested()` pour créer une notification
--    dans `notifications` pour tous les administrateurs avec le titre et la raison.
-- 3. Fournir la fonction RPC `request_listing_deletion()` (SECURITY DEFINER)
--    pour une exécution garantie et atomique depuis le frontend.
-- ============================================================================

-- ── 1. Correction du trigger de garde sur listings ───────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_direct_listing_deletion_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_role TEXT;
BEGIN
  -- Autoriser si appelé par service_role
  IF current_setting('request.jwt.claims', true)::json->>'role' = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- CAS 1 : Passage vers 'suppression_demandee'
  IF NEW.status = 'suppression_demandee' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Autorisé s'il existe une demande de suppression en attente pour cette annonce
    IF NOT EXISTS (
      SELECT 1 FROM public.listing_deletion_requests
      WHERE listing_id = NEW.id AND status = 'pending'
    ) THEN
      RAISE EXCEPTION 'Transition vers suppression_demandee non autorisée sans demande de suppression active.';
    END IF;
    RETURN NEW;
  END IF;

  -- CAS 2 : Passage vers 'supprimee'
  IF NEW.status = 'supprimee' AND OLD.status IS DISTINCT FROM NEW.status THEN
    SELECT role INTO v_user_role FROM public.users WHERE id = auth.uid();
    IF v_user_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Transition de statut non autorisée : seul un administrateur peut marquer une annonce comme supprimée.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- ── 2. Trigger avec notification aux administrateurs ─────────────────────────

CREATE OR REPLACE FUNCTION public.fn_on_listing_deletion_requested()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_title TEXT;
  v_owner_name TEXT;
  v_admin RECORD;
BEGIN
  -- Mettre à jour le statut de l'annonce
  UPDATE public.listings
  SET status = 'suppression_demandee'
  WHERE id = NEW.listing_id;

  -- Récupérer le titre et le nom du propriétaire
  SELECT title INTO v_listing_title FROM public.listings WHERE id = NEW.listing_id;
  SELECT full_name INTO v_owner_name FROM public.users WHERE id = NEW.owner_id;

  -- Notifier chaque administrateur
  FOR v_admin IN (SELECT id FROM public.users WHERE role = 'admin') LOOP
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      body,
      is_read,
      related_id
    ) VALUES (
      v_admin.id,
      'suppression_annonce_demandee',
      'Nouvelle demande de suppression',
      COALESCE(v_owner_name, 'Un propriétaire') || ' demande la suppression de l''annonce "' || COALESCE(v_listing_title, 'Sans titre') || '". Motif : ' || NEW.reason,
      false,
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- ── 3. RPC explicite pour les demandes de suppression ────────────────────────

CREATE OR REPLACE FUNCTION public.request_listing_deletion(
  p_listing_id UUID,
  p_reason VARCHAR(255),
  p_custom_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_req_id UUID;
BEGIN
  -- Vérifier que l'annonce appartient bien à l'utilisateur connecté
  SELECT owner_id INTO v_owner_id FROM public.listings WHERE id = p_listing_id;
  IF v_owner_id IS NULL OR v_owner_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Vous n''êtes pas autorisé à demander la suppression de cette annonce.';
  END IF;

  -- Vérifier si une demande est déjà en cours
  IF EXISTS (
    SELECT 1 FROM public.listing_deletion_requests
    WHERE listing_id = p_listing_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Une demande de suppression est déjà en cours pour cette annonce.';
  END IF;

  -- Insérer la demande
  INSERT INTO public.listing_deletion_requests (
    listing_id,
    owner_id,
    reason,
    custom_reason,
    status
  ) VALUES (
    p_listing_id,
    auth.uid(),
    p_reason,
    p_custom_reason,
    'pending'
  )
  RETURNING id INTO v_req_id;

  RETURN v_req_id;
END;
$$;

-- Permissions d'exécution
GRANT EXECUTE ON FUNCTION public.request_listing_deletion(UUID, VARCHAR, TEXT) TO authenticated;
