GRANT SELECT ON public.ru_api_log TO authenticated;
GRANT SELECT ON public.ru_call_queue TO authenticated;
GRANT SELECT ON public.ru_roster_cache TO authenticated;
GRANT ALL ON public.ru_api_log TO service_role;
GRANT ALL ON public.ru_call_queue TO service_role;
GRANT ALL ON public.ru_roster_cache TO service_role;

CREATE OR REPLACE FUNCTION public.ru_traffic_viewer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'dev'::app_role)
      OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
$$;

GRANT EXECUTE ON FUNCTION public.ru_traffic_viewer() TO authenticated;