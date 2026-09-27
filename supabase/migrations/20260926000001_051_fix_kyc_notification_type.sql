-- Fix notification type for owner verification decisions.
-- The RPC admin_decide_owner_verification was inserting notifications
-- with type 'confirmation' (which maps to "Paiement validé" in the UI).
-- We replace it with dedicated types: 'owner_verified' and 'owner_verification_rejected'.

CREATE OR REPLACE FUNCTION public.admin_decide_owner_verification(
  p_request_id UUID,
  p_decision   TEXT,
  p_reason     TEXT DEFAULT NULL,
  p_note       TEXT DEFAULT NULL
)
RETURNS TABLE (verification_status TEXT, reviewed_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin_id  UUID := auth.uid();
  v_decision  TEXT := lower(trim(p_decision));
  v_reason    TEXT := trim(p_reason);
  v_note      TEXT := trim(p_note);
  v_request   public.owner_verification_requests%ROWTYPE;
  v_now       TIMESTAMPTZ := now();
BEGIN
  -- Vérifications de sécurité identiques à la version précédente
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.users WHERE id = v_admin_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Accès réservé aux administrateurs';
  END IF;

  IF v_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Décision invalide : approved ou rejected attendu';
  END IF;

  SELECT * INTO v_request
  FROM public.owner_verification_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;

  IF v_request.status NOT IN ('en_attente', 'en_cours') THEN
    RAISE EXCEPTION 'Cette demande a déjà été traitée';
  END IF;

  IF v_decision = 'rejected' AND (v_reason IS NULL OR length(v_reason) = 0) THEN
    RAISE EXCEPTION 'Le motif de refus est obligatoire';
  END IF;

  UPDATE public.owner_verification_requests
  SET status         = CASE WHEN v_decision = 'approved' THEN 'approuve' ELSE 'refuse' END,
      reviewed_at    = v_now,
      reviewed_by    = v_admin_id,
      rejection_reason = CASE WHEN v_decision = 'rejected' THEN v_reason ELSE NULL END,
      admin_note     = v_note,
      updated_at     = v_now
  WHERE id = v_request.id;

  UPDATE public.users
  SET owner_verification_status = CASE WHEN v_decision = 'approved' THEN 'verifie' ELSE 'refuse' END,
      owner_verified_at         = CASE WHEN v_decision = 'approved' THEN v_now ELSE NULL END,
      owner_verification_updated_at = v_now
  WHERE id = v_request.owner_id;

  -- FIX: utiliser des types dédiés au lieu de 'confirmation'
  INSERT INTO public.notifications (user_id, type, title, body, related_id)
  VALUES (
    v_request.owner_id,
    CASE WHEN v_decision = 'approved' THEN 'owner_verified' ELSE 'owner_verification_rejected' END,
    CASE WHEN v_decision = 'approved' THEN 'Identité vérifiée ✓' ELSE 'Vérification refusée' END,
    CASE WHEN v_decision = 'approved'
      THEN 'Votre identité a été vérifiée. Vous pouvez désormais demander un retrait.'
      ELSE 'Votre dossier de vérification a été refusé. Consultez le motif puis soumettez de nouveaux documents.'
    END,
    v_request.id
  );

  INSERT INTO public.audit_logs (user_id, action, entity_type, entity_id, details)
  VALUES (
    v_admin_id,
    CASE WHEN v_decision = 'approved' THEN 'owner_verification_approved' ELSE 'owner_verification_rejected' END,
    'owner_verification_requests', v_request.id,
    jsonb_build_object('owner_id', v_request.owner_id, 'document_type', v_request.document_type)
  );

  RETURN QUERY SELECT
    CASE WHEN v_decision = 'approved' THEN 'verifie'::TEXT ELSE 'refuse'::TEXT END,
    v_now;
END;
$$;
