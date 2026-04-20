CREATE TABLE public.ru_locations (
  id integer PRIMARY KEY,
  name text NOT NULL,
  country text NOT NULL,
  currency_iso text,
  currency_ru_id integer,
  last_synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ru_locations_country ON public.ru_locations (country);
CREATE INDEX idx_ru_locations_name_lower ON public.ru_locations (lower(name));

ALTER TABLE public.ru_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read ru_locations"
ON public.ru_locations
FOR SELECT
TO authenticated
USING (true);
