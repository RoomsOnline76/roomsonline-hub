select cron.schedule(
  'ru-lnm-repull-drain',
  '*/2 * * * *',
  $$
  select net.http_post(
    url:='https://qmprswbgkpzcvexmmcbf.supabase.co/functions/v1/cron-ru-lnm-repull',
    headers:='{"Content-Type": "application/json"}'::jsonb,
    body:='{"trigger":"cron"}'::jsonb
  ) as request_id;
  $$
);