/*
  Migration: 20260718000003_020_fix_cron_health_window.sql
  Description: Étend la fenêtre de lecture de cron.job_run_details à 30h
  pour couvrir le cron daily (update-overdue-rent-periods) qui tourne
  à 01h00 UTC et serait invisible avec la fenêtre précédente de 2h.
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
  WHERE d.start_time > now() - interval '30 hours'
  ORDER BY d.start_time DESC;
$$;

-- Permissions inchangées — on s'assure qu'elles sont toujours en place
REVOKE EXECUTE ON FUNCTION public.admin_get_cron_health() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_cron_health() TO service_role;
