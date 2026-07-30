ALTER TABLE public.ru_owner_accounts
  ADD COLUMN IF NOT EXISTS ru_login_password_enc bytea,
  ADD COLUMN IF NOT EXISTS company_details_status text NOT NULL DEFAULT 'pending';