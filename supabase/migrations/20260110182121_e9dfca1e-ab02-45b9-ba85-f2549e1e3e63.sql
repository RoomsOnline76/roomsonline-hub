-- Remove the 30-minute regular health check job
SELECT cron.unschedule('regular-health-check');