ALTER TABLE public.report_source_files
  ADD COLUMN IF NOT EXISTS parse_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS detected_mapping jsonb,
  ADD COLUMN IF NOT EXISTS applied_mapping jsonb,
  ADD COLUMN IF NOT EXISTS sheet_used text,
  ADD COLUMN IF NOT EXISTS parse_note text;

ALTER TABLE public.property_report_settings
  ADD COLUMN IF NOT EXISTS nightsbridge_column_map jsonb;