CREATE TABLE IF NOT EXISTS public.ru_roster_cache (
  cache_key TEXT PRIMARY KEY,
  users JSONB NOT NULL DEFAULT '[]'::jsonb,
  user_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT
);

GRANT SELECT ON public.ru_roster_cache TO authenticated;
GRANT ALL ON public.ru_roster_cache TO service_role;

ALTER TABLE public.ru_roster_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can read the channel roster cache"
ON public.ru_roster_cache
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);