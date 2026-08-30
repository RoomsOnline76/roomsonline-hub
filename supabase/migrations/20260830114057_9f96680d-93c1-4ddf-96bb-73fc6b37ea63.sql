ALTER TABLE public.ru_api_credentials ADD COLUMN IF NOT EXISTS auth_mode text;
ALTER TABLE public.ru_api_credentials ADD COLUMN IF NOT EXISTS password_enc bytea;