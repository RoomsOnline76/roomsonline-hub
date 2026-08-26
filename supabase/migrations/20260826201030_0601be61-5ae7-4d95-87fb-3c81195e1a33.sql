ALTER TABLE public.ru_api_credentials
  ADD COLUMN IF NOT EXISTS key_scope text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS key_scope_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS key_scope_detail jsonb;

ALTER TABLE public.ru_api_credentials
  DROP CONSTRAINT IF EXISTS ru_api_credentials_key_scope_check;

ALTER TABLE public.ru_api_credentials
  ADD CONSTRAINT ru_api_credentials_key_scope_check
  CHECK (key_scope IN ('unverified', 'child', 'master_pair'));

COMMENT ON COLUMN public.ru_api_credentials.key_scope IS
  'Proven scope of this key pair: child = authenticates as the sub-account only; master_pair = actually authenticates as our master account (writes made with it land in the master account and must be refused); unverified = not yet proven.';