-- ============================================================================
-- Migration 031: Contrainte d'unicité partielle sur les baux actifs par logement
-- Empêche la race condition de double occupation concurrente d'un même bien.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_lease_per_property
ON public.leases (property_id)
WHERE status = 'actif';

COMMENT ON INDEX public.uniq_active_lease_per_property IS 
'Garantit qu''un logement ne peut avoir qu''un seul bail actif simultanément au niveau base de données.';
