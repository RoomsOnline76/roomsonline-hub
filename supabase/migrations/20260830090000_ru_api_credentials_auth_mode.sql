-- §2 auth correction: child accounts may be stored by password (from Push_CreateUser_RQ)
-- until a UI-minted key pair is pasted. access_key is no longer mandatory — a
-- child_password row has no key pair yet.
ALTER TABLE public.ru_api_credentials
  ALTER COLUMN access_key DROP NOT NULL;

ALTER TABLE public.ru_api_credentials
  ADD COLUMN IF NOT EXISTS auth_mode text NOT NULL DEFAULT 'child_keys',
  ADD COLUMN IF NOT EXISTS password_enc bytea;

ALTER TABLE public.ru_api_credentials
  DROP CONSTRAINT IF EXISTS ru_api_credentials_auth_mode_check;
ALTER TABLE public.ru_api_credentials
  ADD CONSTRAINT ru_api_credentials_auth_mode_check
  CHECK (auth_mode IN ('child_keys', 'child_password'));

-- Existing rows all carry a key pair.
UPDATE public.ru_api_credentials SET auth_mode = 'child_keys' WHERE access_key IS NOT NULL;

COMMENT ON COLUMN public.ru_api_credentials.auth_mode IS
  'child_keys: AccessKey/SecretKey pair pasted from the RU UI. child_password: email/password captured from Push_CreateUser_RQ, used until a key pair is pasted. Keys win over password when both exist.';
COMMENT ON COLUMN public.ru_api_credentials.password_enc IS
  'Encrypted sub-user password (from Push_CreateUser_RQ or a later reset), used for XML auth while auth_mode = child_password.';
