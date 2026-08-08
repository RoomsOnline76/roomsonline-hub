ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS current_period_start date,
  ADD COLUMN IF NOT EXISTS subscription_started_on date;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS current_period_start date,
  ADD COLUMN IF NOT EXISTS subscription_started_on date;