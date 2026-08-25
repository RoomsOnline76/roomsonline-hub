REVOKE SELECT ON public.ru_api_log FROM anon;
REVOKE SELECT ON public.ru_call_queue FROM anon;
REVOKE SELECT ON public.ru_roster_cache FROM anon;
REVOKE ALL ON public.ru_api_log FROM PUBLIC;
REVOKE ALL ON public.ru_call_queue FROM PUBLIC;
REVOKE ALL ON public.ru_roster_cache FROM PUBLIC;

GRANT SELECT ON public.ru_api_log TO authenticated;
GRANT SELECT ON public.ru_call_queue TO authenticated;
GRANT SELECT ON public.ru_roster_cache TO authenticated;
GRANT ALL ON public.ru_api_log TO service_role;
GRANT ALL ON public.ru_call_queue TO service_role;
GRANT ALL ON public.ru_roster_cache TO service_role;