CREATE TABLE public.ru_owner_listing_cache (
  owner_id text PRIMARY KEY,
  listings jsonb NOT NULL DEFAULT '[]'::jsonb,
  listing_count integer NOT NULL DEFAULT 0,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  source text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT ALL ON public.ru_owner_listing_cache TO service_role;

ALTER TABLE public.ru_owner_listing_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Backend can manage RU listing cache"
ON public.ru_owner_listing_cache
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_ru_owner_listing_cache_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_ru_owner_listing_cache_updated_at
BEFORE UPDATE ON public.ru_owner_listing_cache
FOR EACH ROW
EXECUTE FUNCTION public.update_ru_owner_listing_cache_updated_at();