ALTER TABLE public.ru_owner_accounts
  ADD COLUMN IF NOT EXISTS ru_wl_access_token text,
  ADD COLUMN IF NOT EXISTS ru_wl_refresh_token text,
  ADD COLUMN IF NOT EXISTS ru_wl_token_expires_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS ru_wl_token_source text;