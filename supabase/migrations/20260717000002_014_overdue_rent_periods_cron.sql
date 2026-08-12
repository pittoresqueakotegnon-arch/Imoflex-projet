-- ============================================================
-- Migration 014 : Cron quotidien pour la mise à jour des retards
--
-- Appelle l'Edge Function update-overdue-rent-periods chaque nuit
-- à minuit UTC pour passer en 'retard' les périodes dépassées.
--
-- Nécessite : pg_cron + pg_net (Supabase Dashboard → Extensions)
-- ============================================================

-- Suppression idempotente si le job existe déjà
SELECT cron.unschedule('update-overdue-rent-periods-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'update-overdue-rent-periods-daily'
);

SELECT cron.schedule(
  'update-overdue-rent-periods-daily',
  '0 0 * * *',   -- Tous les jours à 00:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/update-overdue-rent-periods',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- NOTE : Même remarque que pour la migration 012 concernant
-- current_setting('app.settings.service_role_key', true).
-- Préférer l'approche Vault pour la sécurité en production :
--
--   (SELECT decrypted_secret FROM vault.decrypted_secrets
--    WHERE name = 'service_role_key')
-- ============================================================
