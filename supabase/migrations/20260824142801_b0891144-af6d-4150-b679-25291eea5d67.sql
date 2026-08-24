ALTER TABLE public.report_insights
  ADD COLUMN IF NOT EXISTS experimental jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS experimental_provider text,
  ADD COLUMN IF NOT EXISTS experimental_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS experimental_error text;