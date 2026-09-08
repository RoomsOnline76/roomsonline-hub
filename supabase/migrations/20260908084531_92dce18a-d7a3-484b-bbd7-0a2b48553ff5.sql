-- 1. Open action items raised when the channel needs a human at the portal
CREATE TABLE public.ru_open_actions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind text NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  booking_id uuid,
  reservation_id text,
  verb text,
  title text NOT NULL,
  detail text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'open',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  resolved_at timestamp with time zone
);

CREATE UNIQUE INDEX ru_open_actions_unique_open
  ON public.ru_open_actions (kind, coalesce(reservation_id, ''), coalesce(property_id::text, ''))
  WHERE status = 'open';
CREATE INDEX ru_open_actions_status_created ON public.ru_open_actions (status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.ru_open_actions TO authenticated;
GRANT ALL ON public.ru_open_actions TO service_role;
ALTER TABLE public.ru_open_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channel viewers read open actions"
  ON public.ru_open_actions FOR SELECT TO authenticated
  USING (public.ru_traffic_viewer());
CREATE POLICY "Channel viewers resolve open actions"
  ON public.ru_open_actions FOR UPDATE TO authenticated
  USING (public.ru_traffic_viewer()) WITH CHECK (public.ru_traffic_viewer());

-- 2. Resolution markers so a cleared error pattern stays visibly cleared
CREATE TABLE public.ru_error_resolutions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pattern_key text NOT NULL UNIQUE,
  verb text,
  note text NOT NULL,
  verified_at timestamp with time zone,
  verified_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ru_error_resolutions TO authenticated;
GRANT ALL ON public.ru_error_resolutions TO service_role;
ALTER TABLE public.ru_error_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channel viewers read resolutions"
  ON public.ru_error_resolutions FOR SELECT TO authenticated
  USING (public.ru_traffic_viewer());
CREATE POLICY "Channel viewers write resolutions"
  ON public.ru_error_resolutions FOR INSERT TO authenticated
  WITH CHECK (public.ru_traffic_viewer());
CREATE POLICY "Channel viewers update resolutions"
  ON public.ru_error_resolutions FOR UPDATE TO authenticated
  USING (public.ru_traffic_viewer()) WITH CHECK (public.ru_traffic_viewer());

-- 3. Endpoint counters split channel refusals from transport failures
DROP FUNCTION IF EXISTS public.ru_api_log_endpoint_stats(integer);
CREATE FUNCTION public.ru_api_log_endpoint_stats(_hours integer DEFAULT 24)
 RETURNS TABLE(action text, direction text, total bigint, ok bigint, failed bigint, deferred bigint,
               refused bigint, transport_failed bigint,
               avg_ms integer, p95_ms integer, last_at timestamp with time zone,
               req_bytes bigint, res_bytes bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    l.action,
    l.direction,
    count(*)::bigint,
    count(*) FILTER (WHERE l.success)::bigint,
    count(*) FILTER (WHERE NOT l.success AND coalesce(l.transport_status, '') <> 'rate_deferred')::bigint,
    count(*) FILTER (WHERE l.transport_status = 'rate_deferred')::bigint,
    count(*) FILTER (
      WHERE NOT l.success
        AND coalesce(l.transport_status, '') <> 'rate_deferred'
        AND l.status_id IS NOT NULL
        AND btrim(l.status_id) NOT IN ('0', '5', '26', '339')
    )::bigint,
    count(*) FILTER (
      WHERE NOT l.success
        AND coalesce(l.transport_status, '') <> 'rate_deferred'
        AND l.status_id IS NULL
    )::bigint,
    coalesce(avg(l.elapsed_ms), 0)::int,
    coalesce(percentile_cont(0.95) WITHIN GROUP (ORDER BY l.elapsed_ms), 0)::int,
    max(l.created_at),
    coalesce(sum(l.request_bytes), 0)::bigint,
    coalesce(sum(l.response_bytes), 0)::bigint
  FROM public.ru_api_log l
  WHERE public.ru_traffic_viewer()
    AND (_hours <= 0 OR l.created_at > now() - make_interval(hours => _hours))
  GROUP BY l.action, l.direction
$function$;