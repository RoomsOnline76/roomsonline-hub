ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS toilets integer,
  ADD COLUMN IF NOT EXISTS separate_kitchen boolean NOT NULL DEFAULT false;

ALTER TABLE public.ru_amenities
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'unit',
  ADD COLUMN IF NOT EXISTS popular_rank integer,
  ADD COLUMN IF NOT EXISTS ru_group text,
  ADD COLUMN IF NOT EXISTS supports_count boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS ru_amenities_popular_rank_idx
  ON public.ru_amenities (popular_rank) WHERE popular_rank IS NOT NULL;
CREATE INDEX IF NOT EXISTS ru_amenities_scope_idx ON public.ru_amenities (scope);