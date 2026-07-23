
-- Portfolio aggregator as an add-on rather than a billing strategy
ALTER TABLE public.property_portfolios
  ADD COLUMN IF NOT EXISTS aggregator_billing_mode text NOT NULL DEFAULT 'none' CHECK (aggregator_billing_mode IN ('none','monthly','once_off')),
  ADD COLUMN IF NOT EXISTS aggregator_monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS aggregator_setup_fee numeric,
  ADD COLUMN IF NOT EXISTS aggregator_activated_at timestamptz;

ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS portfolio_aggregator_monthly_default numeric,
  ADD COLUMN IF NOT EXISTS portfolio_aggregator_setup_default numeric,
  ADD COLUMN IF NOT EXISTS portfolio_aggregator_billing_mode text DEFAULT 'monthly' CHECK (portfolio_aggregator_billing_mode IN ('none','monthly','once_off'));
