ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS pricelabs_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pricelabs_monthly_fee numeric;

ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS pricelabs_monthly_fee numeric;

ALTER TABLE public.property_portfolios
  ADD COLUMN IF NOT EXISTS pricelabs_monthly_fee numeric;