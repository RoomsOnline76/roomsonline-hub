ALTER TABLE public.ru_owner_accounts
  ADD COLUMN IF NOT EXISTS company_profile jsonb;

COMMENT ON COLUMN public.ru_owner_accounts.company_profile IS
  'Admin-entered Rentals United company/contact/legal-representative profile overrides merged into Push_FillCompanyDetails_RQ.';