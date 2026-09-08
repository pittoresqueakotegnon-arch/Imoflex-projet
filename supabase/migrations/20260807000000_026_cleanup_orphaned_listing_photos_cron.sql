-- ============================================================
-- Migration 026 : Cron quotidien de nettoyage des photos d'annonces orphelines
--
-- Appelle l'Edge Function cleanup-orphaned-listing-photos chaque nuit
-- à 03:00 UTC pour supprimer les fichiers de dossiers d'annonces non publiées (plus de 24h).
--
-- Nécessite : pg_cron + pg_net
-- ============================================================

SELECT cron.unschedule('cleanup-orphaned-listing-photos-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-orphaned-listing-photos-daily'
);

SELECT cron.schedule(
  'cleanup-orphaned-listing-photos-daily',
  '0 3 * * *',   -- Tous les jours à 03:00 UTC
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/cleanup-orphaned-listing-photos',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
        current_setting('app.settings.service_role_key', true)
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
