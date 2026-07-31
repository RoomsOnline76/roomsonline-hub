ALTER TABLE public.ru_amenities
  ADD COLUMN IF NOT EXISTS is_recommended boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ru_amenities_category_idx ON public.ru_amenities (category);
CREATE INDEX IF NOT EXISTS ru_amenities_recommended_idx ON public.ru_amenities (is_recommended) WHERE is_recommended;