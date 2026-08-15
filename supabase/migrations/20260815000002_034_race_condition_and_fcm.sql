-- ============================================================================
-- Migration 034: Race condition + Auto-reset disponibilité + FCM token
-- ============================================================================

-- ── 1. Index unique partiel (demandé explicitement) ───────────────────────────
-- Empêche qu'un même logement ait plus d'un bail actif simultanément.
-- Complémentaire à uniq_active_lease_per_property (031) — utilise l'alias
-- idx_unique_active_lease_per_property pour correspondre exactement à la demande.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_lease_per_property
ON public.leases (property_id)
WHERE status = 'actif';

-- ── 2. Trigger : reset automatique de availability_status ─────────────────────
-- Quand un bail passe à 'termine' ou 'resilie', le logement associé repasse
-- automatiquement à 'disponible'. Cela empêche de laisser un bien bloqué
-- "occupe" manuellement alors qu'aucun bail actif ne l'occupe.

CREATE OR REPLACE FUNCTION public.fn_reset_listing_availability_on_lease_end()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_listing_id UUID;
BEGIN
  -- Vérifier que le statut passe bien à un statut "terminé"
  IF NEW.status IN ('termine', 'resilie') AND OLD.status = 'actif' THEN
    -- Retrouver le listing_id via la table properties
    SELECT p.listing_id INTO v_listing_id
    FROM properties p
    WHERE p.id = NEW.property_id;

    -- Ne mettre à jour que si le listing existe et est encore marqué occupé/réservé
    IF v_listing_id IS NOT NULL THEN
      UPDATE public.listings
      SET availability_status = 'disponible'
      WHERE id = v_listing_id
        AND availability_status IN ('occupe', 'reserve');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Supprimer l'ancien trigger s'il existe déjà (idempotence)
DROP TRIGGER IF EXISTS trg_reset_availability_on_lease_end ON public.leases;

CREATE TRIGGER trg_reset_availability_on_lease_end
AFTER UPDATE OF status ON public.leases
FOR EACH ROW
EXECUTE FUNCTION public.fn_reset_listing_availability_on_lease_end();

-- ── 3. Colonne fcm_token sur la table users ───────────────────────────────────
-- Stocke le token FCM pour l'envoi de notifications push natives.
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS fcm_token TEXT;

COMMENT ON COLUMN public.users.fcm_token IS 
'Token Firebase Cloud Messaging pour les notifications push natives (Capacitor). Mis à jour à la connexion.';
