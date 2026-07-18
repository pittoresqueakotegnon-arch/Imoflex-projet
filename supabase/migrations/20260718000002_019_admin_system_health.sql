/*
  Migration: 20260718000002_019_admin_system_health.sql
  Description: Crée une fonction RPC lisant `cron.job_run_details`.
  Strictement réservée au rôle `service_role`.
*/

CREATE OR REPLACE FUNCTION public.admin_get_cron_health()
RETURNS TABLE (
  jobname text,
  status text,
  start_time timestamp with time zone,
  return_message text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT j.jobname, d.status, d.start_time, d.return_message
  FROM cron.job_run_details d
  JOIN cron.job j ON j.jobid = d.jobid
  WHERE d.start_time > now() - interval '2 hours'
  ORDER BY d.start_time DESC;
$$;

-- Révocation de toutes les permissions publiques/authentifiées
REVOKE EXECUTE ON FUNCTION public.admin_get_cron_health() FROM PUBLIC, authenticated, anon;

-- Octroi de la permission exclusivement au rôle de service
GRANT EXECUTE ON FUNCTION public.admin_get_cron_health() TO service_role;
