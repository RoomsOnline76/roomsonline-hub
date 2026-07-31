CREATE TABLE IF NOT EXISTS public.ru_amenities (
  id integer PRIMARY KEY,
  name text NOT NULL,
  ru_group_id integer,
  category text,
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ru_amenities TO authenticated;
GRANT ALL ON public.ru_amenities TO service_role;

ALTER TABLE public.ru_amenities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read RU amenity catalogue"
ON public.ru_amenities
FOR SELECT
TO authenticated
USING (true);