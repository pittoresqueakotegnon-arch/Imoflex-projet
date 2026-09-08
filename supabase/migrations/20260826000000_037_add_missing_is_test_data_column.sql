-- ============================================================================
-- Migration 037 : Ajout de la colonne is_test_data (manquante depuis l'origine)
--
-- Le frontend filtre sur `.eq('is_test_data', false)` dans au moins 8 fichiers
-- (useWallet.ts, adminDashboardService.ts, AdminTransactions.tsx, Historique.tsx,
-- FicheBail.tsx, Dashboard.tsx, LogementDetail.tsx) depuis le début du projet,
-- mais cette colonne n'a jamais été créée sur `payments` ni `withdrawals`.
-- Conséquence : toutes ces requêtes échouent (colonne inexistante), ce qui casse
-- silencieusement l'historique des paiements, la fiche de bail et le dashboard
-- admin (KPI figés à 0). Voir AUDIT_TECHNIQUE_IMOFLEX_v2.md §2.2.
-- ============================================================================

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.withdrawals
ADD COLUMN IF NOT EXISTS is_test_data BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.payments.is_test_data IS
'Marque un paiement créé en sandbox/test pour l''exclure des statistiques et historiques de production.';

COMMENT ON COLUMN public.withdrawals.is_test_data IS
'Marque un retrait créé en sandbox/test pour l''exclure des statistiques et historiques de production.';

-- Index partiels pour ne pas pénaliser les requêtes qui filtrent is_test_data = false
-- (cas très majoritaire en production).
CREATE INDEX IF NOT EXISTS idx_payments_not_test
ON public.payments (status, validated_at)
WHERE is_test_data = false;

CREATE INDEX IF NOT EXISTS idx_withdrawals_not_test
ON public.withdrawals (status)
WHERE is_test_data = false;
