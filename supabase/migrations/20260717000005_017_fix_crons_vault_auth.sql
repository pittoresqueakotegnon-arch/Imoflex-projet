-- ============================================================
-- Migration 017 : Correction de l'authentification des crons
--
-- Les jobs créés en 012 et 014 utilisaient :
--   current_setting('app.settings.service_role_key', true)
-- → jamais configuré → Bearer vide → HTTP 401 silencieux.
--
-- Cette migration déprogramme les anciens jobs et les recrée
-- avec la lecture du secret via vault.decrypted_secrets.
--
-- !! PRÉREQUIS OBLIGATOIRE AVANT D'APPLIQUER !!
-- Créer le secret dans Dashboard → Database → Vault :
--   Nom exact (sensible à la casse) : service_role_key
--   Valeur : clé service_role (Project Settings → API)
--
-- Vérifier que le secret est bien lisible avant d'appliquer :
--   SELECT name, decrypted_secret IS NOT NULL AS has_value
--   FROM vault.decrypted_secrets
--   WHERE name = 'service_role_key';
-- → doit retourner has_value = true
-- ============================================================

-- ---- Job 1 : reconcile-payments (toutes les 10 min) ----

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
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ---- Job 2 : update-overdue-rent-periods (quotidien 01:00 UTC) ----
-- Note : passage de 00:00 à 01:00 UTC pour laisser une marge
-- après minuit (Afrique de l'Ouest = UTC+0 ou UTC+1)

SELECT cron.unschedule('update-overdue-rent-periods-daily')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'update-overdue-rent-periods-daily'
);

SELECT cron.schedule(
  'update-overdue-rent-periods-daily',
  '0 1 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/update-overdue-rent-periods',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'service_role_key'
        LIMIT 1
      ),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ============================================================
-- Vérification après application :
--
-- 1. Jobs enregistrés :
--    SELECT jobname, schedule, command FROM cron.job ORDER BY jobname;
--
-- 2. Après le prochain cycle (~10 min pour reconcile) :
--    SELECT jobname, status, return_message, start_time
--    FROM cron.job_run_details
--    ORDER BY start_time DESC
--    LIMIT 10;
--    → status doit être 'succeeded' pour les deux jobs
-- ============================================================
