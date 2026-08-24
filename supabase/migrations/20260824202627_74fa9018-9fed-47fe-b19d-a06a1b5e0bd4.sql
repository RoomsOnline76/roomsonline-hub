ALTER TABLE public.ru_api_log REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'ru_api_log'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.ru_api_log';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ru_api_log_endpoint_stats(_hours integer DEFAULT 24)
RETURNS TABLE (
  action text,
  direction text,
  total bigint,
  ok bigint,
  failed bigint,
  deferred bigint,
  avg_ms integer,
  p95_ms integer,
  last_at timestamptz,
  req_bytes bigint,
  res_bytes bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    l.action,
    l.direction,
    count(*)::bigint,
    count(*) FILTER (WHERE l.success)::bigint,
    count(*) FILTER (WHERE NOT l.success AND coalesce(l.transport_status, '') <> 'rate_deferred')::bigint,
    count(*) FILTER (WHERE l.transport_status = 'rate_deferred')::bigint,
    coalesce(avg(l.elapsed_ms), 0)::int,
    coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY l.elapsed_ms), 0)::int,
    max(l.created_at),
    coalesce(sum(l.request_bytes), 0)::bigint,
    coalesce(sum(l.response_bytes), 0)::bigint
  FROM public.ru_api_log l
  WHERE _hours <= 0 OR l.created_at > now() - make_interval(hours => _hours)
  GROUP BY l.action, l.direction
$$;

GRANT EXECUTE ON FUNCTION public.ru_api_log_endpoint_stats(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.ru_api_log_traffic_pulse()
RETURNS TABLE (
  window_minutes integer,
  calls bigint,
  ok bigint,
  failed bigint,
  deferred bigint,
  inbound bigint,
  p50_ms integer,
  p95_ms integer,
  req_bytes bigint,
  res_bytes bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH windows(m) AS (VALUES (1), (5), (60))
  SELECT
    w.m,
    count(l.id)::bigint,
    count(l.id) FILTER (WHERE l.success)::bigint,
    count(l.id) FILTER (WHERE NOT l.success AND coalesce(l.transport_status, '') <> 'rate_deferred')::bigint,
    count(l.id) FILTER (WHERE l.transport_status = 'rate_deferred')::bigint,
    count(l.id) FILTER (WHERE l.direction = 'inbound')::bigint,
    coalesce(percentile_cont(0.5) WITHIN GROUP (ORDER BY l.elapsed_ms), 0)::int,
    coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY l.elapsed_ms), 0)::int,
    coalesce(sum(l.request_bytes), 0)::bigint,
    coalesce(sum(l.response_bytes), 0)::bigint
  FROM windows w
  LEFT JOIN public.ru_api_log l
    ON l.created_at > now() - make_interval(mins => w.m)
  GROUP BY w.m
  ORDER BY w.m
$$;

GRANT EXECUTE ON FUNCTION public.ru_api_log_traffic_pulse() TO authenticated;