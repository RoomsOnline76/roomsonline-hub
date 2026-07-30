ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ru_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ru_archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_properties_ru_archived ON public.properties (ru_archived) WHERE ru_archived = true;