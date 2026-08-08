ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_effective_date date,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancel_effective_date date,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz;