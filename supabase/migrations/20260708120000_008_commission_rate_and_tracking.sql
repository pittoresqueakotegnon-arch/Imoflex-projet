-- Migration 008 : Commission 6% — traçabilité des revenus ImoFlex
-- Date: 2026-07-08
-- Objectif:
--   1. Ajouter les colonnes commission_amount et commission_rate_applied sur payments
--      → permet de calculer le revenu total ImoFlex via SELECT SUM(commission_amount)
--      → garde une trace du taux appliqué sur chaque transaction historique
--   2. Mettre à jour app_config : passer commission_rate de 5 à 6
--      → le webhook lit cette valeur dynamiquement, aucun redéploiement nécessaire pour les futurs changements

-- =====================================================================
-- 1. Colonnes de traçabilité de la commission sur payments
-- =====================================================================
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS commission_amount INTEGER,
  ADD COLUMN IF NOT EXISTS commission_rate_applied NUMERIC(4,2);

-- =====================================================================
-- 2. Mise à jour du taux de commission à 6%
-- =====================================================================
UPDATE app_config
SET value = '6', updated_at = NOW()
WHERE key = 'commission_rate';

-- Insérer la valeur par défaut si la ligne n'existe pas encore
INSERT INTO app_config (key, value)
VALUES ('commission_rate', '6')
ON CONFLICT (key) DO NOTHING;
