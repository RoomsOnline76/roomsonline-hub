-- Add additional fields to pms_credentials for Benson integration
ALTER TABLE public.pms_credentials 
ADD COLUMN IF NOT EXISTS property_code text,
ADD COLUMN IF NOT EXISTS property_name text,
ADD COLUMN IF NOT EXISTS base_url text;

-- Add comment for clarity
COMMENT ON COLUMN public.pms_credentials.property_code IS 'Property code for PMS system';
COMMENT ON COLUMN public.pms_credentials.property_name IS 'Property name in PMS system';
COMMENT ON COLUMN public.pms_credentials.base_url IS 'Base URL for PMS API endpoint';