-- Enable pg_cron extension (should already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Enable pg_net for HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create a function to call the daily health report edge function
CREATE OR REPLACE FUNCTION public.trigger_daily_health_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  supabase_url text;
  anon_key text;
BEGIN
  -- Get the Supabase URL and anon key from api_keys table or use hardcoded values
  supabase_url := 'https://qmprswbgkpzcvexmmcbf.supabase.co';
  anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcHJzd2Jna3B6Y3ZleG1tY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODc1NzIsImV4cCI6MjA3OTA2MzU3Mn0.huhYl5OInMevQp7EYHgv8uiLPpWiRrZvy1J7euCEX-g';
  
  -- Make HTTP POST request to the edge function
  PERFORM extensions.http_post(
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

-- Schedule the cron job to run at 06:00 UTC (08:00 SAST) every day
SELECT cron.schedule(
  'daily-health-report-email',
  '0 6 * * *',
  $$SELECT public.trigger_daily_health_report()$$
);

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.trigger_daily_health_report() TO service_role;