-- Function to trigger system health check via HTTP
CREATE OR REPLACE FUNCTION public.trigger_system_health_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  supabase_url text := 'https://qmprswbgkpzcvexmmcbf.supabase.co';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcHJzd2Jna3B6Y3ZleG1tY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODc1NzIsImV4cCI6MjA3OTA2MzU3Mn0.huhYl5OInMevQp7EYHgv8uiLPpWiRrZvy1J7euCEX-g';
BEGIN
  -- Make HTTP POST request to the system-health-check edge function
  PERFORM extensions.http_post(
    url := supabase_url || '/functions/v1/system-health-check',
    body := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || anon_key,
      'apikey', anon_key
    )
  );
END;
$$;

-- Schedule regular health checks every 30 minutes
SELECT cron.schedule(
  'regular-health-check',
  '*/30 * * * *',
  $$SELECT public.trigger_system_health_check()$$
);

-- Schedule pre-email health check at 05:45 UTC (07:45 SAST) - 15 mins before daily report
SELECT cron.schedule(
  'pre-email-health-check',
  '45 5 * * *',
  $$SELECT public.trigger_system_health_check()$$
);