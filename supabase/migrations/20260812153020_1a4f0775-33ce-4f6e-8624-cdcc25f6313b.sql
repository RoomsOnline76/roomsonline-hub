CREATE TABLE public.ru_property_types (
  ru_type_id integer PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ru_property_types TO authenticated;
GRANT SELECT ON public.ru_property_types TO anon;
GRANT ALL ON public.ru_property_types TO service_role;

ALTER TABLE public.ru_property_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Channel property types are readable"
ON public.ru_property_types
FOR SELECT
USING (true);

CREATE INDEX idx_ru_property_types_slug ON public.ru_property_types (slug);