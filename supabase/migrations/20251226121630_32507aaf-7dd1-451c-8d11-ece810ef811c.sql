-- Add Little Hotelier columns to properties table
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS littlehotelier_channel_code TEXT;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS littlehotelier_region TEXT;

-- Add comments for documentation
COMMENT ON COLUMN public.properties.littlehotelier_channel_code IS 'Little Hotelier channel code for Rates API access';
COMMENT ON COLUMN public.properties.littlehotelier_region IS 'Little Hotelier region (apac or emea) for API endpoint selection';