-- Fix trigger_daily_health_report to use net.http_post instead of extensions.http_post
CREATE OR REPLACE FUNCTION public.trigger_daily_health_report()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $$
DECLARE
  supabase_url text := 'https://qmprswbgkpzcvexmmcbf.supabase.co';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcHJzd2Jna3B6Y3ZleG1tY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODc1NzIsImV4cCI6MjA3OTA2MzU3Mn0.huhYl5OInMevQp7EYHgv8uiLPpWiRrZvy1J7euCEX-g';
BEGIN
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

-- Fix trigger_system_health_check to use net.http_post instead of extensions.http_post
CREATE OR REPLACE FUNCTION public.trigger_system_health_check()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'net'
AS $$
DECLARE
  supabase_url text := 'https://qmprswbgkpzcvexmmcbf.supabase.co';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcHJzd2Jna3B6Y3ZleG1tY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODc1NzIsImV4cCI6MjA3OTA2MzU3Mn0.huhYl5OInMevQp7EYHgv8uiLPpWiRrZvy1J7euCEX-g';
BEGIN
  PERFORM net.http_post(
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