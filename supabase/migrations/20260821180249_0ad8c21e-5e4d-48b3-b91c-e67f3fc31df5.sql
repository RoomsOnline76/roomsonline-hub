ALTER TABLE public.property_report_settings
  ADD COLUMN IF NOT EXISTS brand_source text NOT NULL DEFAULT 'custom';

ALTER TABLE public.property_report_settings
  DROP CONSTRAINT IF EXISTS property_report_settings_brand_source_check;

ALTER TABLE public.property_report_settings
  ADD CONSTRAINT property_report_settings_brand_source_check
  CHECK (brand_source IN ('property', 'rol', 'custom'));