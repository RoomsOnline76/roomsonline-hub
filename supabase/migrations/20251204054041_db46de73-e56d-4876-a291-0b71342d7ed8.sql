-- Add agent_code column to pms_credentials for NightsBridge
ALTER TABLE public.pms_credentials
ADD COLUMN IF NOT EXISTS agent_code text;