ALTER TABLE public.ru_owner_accounts
  ADD COLUMN IF NOT EXISTS ru_api_access_key text,
  ADD COLUMN IF NOT EXISTS ru_api_secret_enc bytea,
  ADD COLUMN IF NOT EXISTS ru_api_key_label text,
  ADD COLUMN IF NOT EXISTS ru_api_keys_verified_at timestamptz;