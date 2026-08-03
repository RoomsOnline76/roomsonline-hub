ALTER TABLE public.ru_locations
  ADD COLUMN IF NOT EXISTS parent_id integer,
  ADD COLUMN IF NOT EXISTS location_type_id integer,
  ADD COLUMN IF NOT EXISTS path text,
  ADD COLUMN IF NOT EXISTS depth integer;

CREATE INDEX IF NOT EXISTS ru_locations_parent_id_idx ON public.ru_locations (parent_id);
CREATE INDEX IF NOT EXISTS ru_locations_type_idx ON public.ru_locations (location_type_id);
CREATE INDEX IF NOT EXISTS ru_locations_name_idx ON public.ru_locations (lower(name));

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ru_location_id integer;