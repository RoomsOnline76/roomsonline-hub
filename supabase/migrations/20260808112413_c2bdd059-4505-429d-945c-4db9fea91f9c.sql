CREATE TABLE public.ru_archive_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  property_name TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('archived','reactivated')),
  unit_count INTEGER NOT NULL DEFAULT 0,
  listing_count INTEGER NOT NULL DEFAULT 0,
  actor_user_id UUID,
  actor_email TEXT,
  reason TEXT,
  ru_status TEXT,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ru_archive_events_property ON public.ru_archive_events(property_id, created_at DESC);
CREATE INDEX idx_ru_archive_events_created ON public.ru_archive_events(created_at DESC);

GRANT SELECT ON public.ru_archive_events TO authenticated;
GRANT ALL ON public.ru_archive_events TO service_role;

ALTER TABLE public.ru_archive_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view channel archive events"
ON public.ru_archive_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);