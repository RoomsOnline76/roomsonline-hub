-- Add capabilities tracking to pms_credentials
-- Each PMS has different supported features
ALTER TABLE public.pms_credentials 
ADD COLUMN IF NOT EXISTS capabilities jsonb DEFAULT '{
  "supports_live_availability": false,
  "supports_rate_fetch": false,
  "supports_create_booking": false,
  "supports_modify_booking": false,
  "supports_webhooks": false
}'::jsonb;

-- Add comment explaining the field
COMMENT ON COLUMN public.pms_credentials.capabilities IS 'PMS capability flags: supports_live_availability, supports_rate_fetch, supports_create_booking, supports_modify_booking, supports_webhooks. Not all PMS systems support all features.';