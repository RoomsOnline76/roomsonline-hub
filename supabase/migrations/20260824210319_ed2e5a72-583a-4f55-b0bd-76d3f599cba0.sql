REVOKE ALL ON public.ru_roster_cache FROM anon;
GRANT SELECT ON public.ru_roster_cache TO authenticated;