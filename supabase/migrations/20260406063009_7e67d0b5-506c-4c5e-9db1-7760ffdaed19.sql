DO $$
DECLARE
  v_job_id bigint;
BEGIN
  FOR v_job_id IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = 'daily-health-report-email'
       OR command ILIKE '%trigger_daily_health_report%'
       OR command ILIKE '%daily-health-report%'
  LOOP
    PERFORM cron.unschedule(v_job_id);
  END LOOP;
END
$$;

INSERT INTO public.api_keys (
  name,
  key_name,
  key_value,
  description,
  is_required,
  system_type,
  created_at,
  updated_at
)
SELECT
  'Daily Health Report Enabled',
  'DAILY_HEALTH_REPORT_ENABLED',
  'false',
  'Feature flag for scheduled daily health report emails',
  false,
  'system',
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1
  FROM public.api_keys
  WHERE key_name = 'DAILY_HEALTH_REPORT_ENABLED'
);

UPDATE public.api_keys
SET key_value = 'false',
    updated_at = now()
WHERE key_name = 'DAILY_HEALTH_REPORT_ENABLED';

CREATE OR REPLACE FUNCTION public.trigger_daily_health_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  anon_key text;
  is_enabled boolean;
BEGIN
  SELECT COALESCE(
    (
      SELECT key_value = 'true'
      FROM public.api_keys
      WHERE key_name = 'DAILY_HEALTH_REPORT_ENABLED'
      ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    ),
    false
  )
  INTO is_enabled;

  IF NOT is_enabled THEN
    RAISE NOTICE 'Daily health report is disabled; skipping trigger.';
    RETURN;
  END IF;

  supabase_url := 'https://qmprswbgkpzcvexmmcbf.supabase.co';
  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcHJzd2Jna3B6Y3ZleG1tY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODc1NzIsImV4cCI6MjA3OTA2MzU3Mn0.huhYl5OInMevQp7EYHgv8uiLPpWiRrZvy1J7euCEX-g';

  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/daily-health-report',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.trigger_daily_health_report() TO service_role;