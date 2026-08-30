CREATE TABLE IF NOT EXISTS public.ru_listing_location_locks (
  ru_property_id BIGINT NOT NULL PRIMARY KEY,
  property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
  published_location_id BIGINT,
  refused_location_id BIGINT,
  reason TEXT,
  refusal_count INTEGER NOT NULL DEFAULT 1,
  first_refused_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ru_listing_location_locks TO authenticated;
GRANT ALL ON public.ru_listing_location_locks TO service_role;

ALTER TABLE public.ru_listing_location_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read channel location locks"
ON public.ru_listing_location_locks
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);