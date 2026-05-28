ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS wetu_id text;
CREATE INDEX IF NOT EXISTS idx_properties_wetu_id ON public.properties (wetu_id) WHERE wetu_id IS NOT NULL;