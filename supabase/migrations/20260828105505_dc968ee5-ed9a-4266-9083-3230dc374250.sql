ALTER TABLE public.property_report_settings
  ADD COLUMN IF NOT EXISTS zero_revenue_keep_patterns text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS row_exclude_patterns text[] NOT NULL DEFAULT '{}'::text[];

ALTER TABLE public.report_snapshots
  ADD COLUMN IF NOT EXISTS derived_inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS excluded_rows jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.report_additional_inputs
  ADD COLUMN IF NOT EXISTS overrides jsonb NOT NULL DEFAULT '{}'::jsonb;