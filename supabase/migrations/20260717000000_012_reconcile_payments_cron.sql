-- ============================================================
-- Migration 012 : Cron de réconciliation automatique des paiements
-- Nécessite les extensions pg_cron et pg_net
-- Activables depuis : Supabase Dashboard → Database → Extensions
-- ============================================================

-- Suppression du job si déjà existant (idempotence)
SELECT cron.unschedule('reconcile-payments-every-10-min')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'reconcile-payments-every-10-min'
);

SELECT cron.schedule(
  'reconcile-payments-every-10-min',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/reconcile-payments?dry_run=false',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- NOTE IMPORTANTE : current_setting('app.settings.service_role_key', true)
-- ne fonctionne que si ce paramètre a été défini au niveau Postgres.
--
-- Option recommandée (la plus fiable) :
--   1. Aller dans Supabase Dashboard → Database → Vault
--   2. Créer un secret nommé "service_role_key" avec la valeur
--      de ta clé SERVICE_ROLE (visible dans Project Settings → API)
--   3. Remplacer dans la requête ci-dessus :
--        current_setting('app.settings.service_role_key', true)
--      par :
--        (SELECT decrypted_secret FROM vault.decrypted_secrets
--         WHERE name = 'service_role_key')
--
-- Alternative (plus simple mais moins sécurisée) :
--   Mettre la clé en dur directement dans le cron (uniquement en dev).
-- ============================================================
