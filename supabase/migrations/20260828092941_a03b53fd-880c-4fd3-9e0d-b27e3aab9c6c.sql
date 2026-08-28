ALTER TABLE public.property_report_settings
  ADD COLUMN IF NOT EXISTS report_layout_template jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.report_snapshots
  ADD COLUMN IF NOT EXISTS booking_trends jsonb NOT NULL DEFAULT '{}'::jsonb;