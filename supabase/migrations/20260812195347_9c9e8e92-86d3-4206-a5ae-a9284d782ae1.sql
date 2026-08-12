CREATE TABLE public.ru_destinations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ru_destination_id integer NOT NULL UNIQUE,
  name text NOT NULL,
  slug text NOT NULL,
  is_generic boolean NOT NULL DEFAULT false,
  synced_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX ru_destinations_slug_idx ON public.ru_destinations (slug);
CREATE INDEX ru_destinations_generic_idx ON public.ru_destinations (is_generic) WHERE is_generic;

GRANT SELECT ON public.ru_destinations TO authenticated;
GRANT ALL ON public.ru_destinations TO service_role;

ALTER TABLE public.ru_destinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view the channel destination dictionary"
ON public.ru_destinations
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

CREATE TRIGGER update_ru_destinations_updated_at
BEFORE UPDATE ON public.ru_destinations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();