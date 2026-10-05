-- Rapproche les retraits dont le payout FedaPay est connu, notamment après un
-- timeout de la requête initiale. Les retraits sans identifiant prestataire
-- restent volontairement réservés pour revue manuelle : aucun remboursement
-- ne doit être fait sans confirmation d'échec du prestataire.
SELECT cron.unschedule('reconcile-withdrawals-every-10-min')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reconcile-withdrawals-every-10-min');

SELECT cron.schedule(
  'reconcile-withdrawals-every-10-min',
  '*/10 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://jogvvjiuumrswwamanqk.supabase.co/functions/v1/reconcile-withdrawals',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
