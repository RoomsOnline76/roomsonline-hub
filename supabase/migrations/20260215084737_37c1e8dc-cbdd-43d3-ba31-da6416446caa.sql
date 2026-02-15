
-- Add branding columns to properties table
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS brand_logo_url text,
  ADD COLUMN IF NOT EXISTS brand_primary_color text,
  ADD COLUMN IF NOT EXISTS brand_secondary_color text,
  ADD COLUMN IF NOT EXISTS brand_font_color text;

-- Add comment for clarity
COMMENT ON COLUMN public.properties.brand_logo_url IS 'URL to the property logo in storage';
COMMENT ON COLUMN public.properties.brand_primary_color IS 'Primary brand color as hex (e.g. #e91e8c)';
COMMENT ON COLUMN public.properties.brand_secondary_color IS 'Secondary brand color as hex';
COMMENT ON COLUMN public.properties.brand_font_color IS 'Font/text brand color as hex';
