-- Scheduled delta sweep for the owner-level HubSpot CRM add-on.
DO $$
BEGIN
  PERFORM cron.unschedule('hubspot-owner-sync') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='hubspot-owner-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'hubspot-owner-sync',
  '*/15 * * * *',
  $$SELECT net.http_post(
      url:='https://qmprswbgkpzcvexmmcbf.supabase.co/functions/v1/cron-hubspot-sync',
      headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcHJzd2Jna3B6Y3ZleG1tY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODc1NzIsImV4cCI6MjA3OTA2MzU3Mn0.huhYl5OInMevQp7EYHgv8uiLPpWiRrZvy1J7euCEX-g"}'::jsonb,
      body:='{"scheduled":true}'::jsonb
  );$$
);