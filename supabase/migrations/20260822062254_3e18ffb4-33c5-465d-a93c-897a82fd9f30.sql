ALTER TABLE public.report_media ADD COLUMN IF NOT EXISTS section_title text;

ALTER TABLE public.report_insights
  ADD COLUMN IF NOT EXISTS narrative_final text,
  ADD COLUMN IF NOT EXISTS include_narrative boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS selections jsonb NOT NULL DEFAULT '{}'::jsonb;