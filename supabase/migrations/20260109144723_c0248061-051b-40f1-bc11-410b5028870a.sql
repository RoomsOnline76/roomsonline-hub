-- Add OAuth token storage columns to owner_pms_credentials
ALTER TABLE public.owner_pms_credentials 
ADD COLUMN IF NOT EXISTS refresh_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;