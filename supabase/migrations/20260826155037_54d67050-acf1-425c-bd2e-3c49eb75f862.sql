ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS pms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS pms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_enabled boolean NOT NULL DEFAULT false;

UPDATE public.property_billing_configs
   SET pms_enabled = COALESCE(subscription_fee_monthly, 0) > 0,
       commission_enabled = commission_rate IS NOT NULL;

UPDATE public.portfolio_billing_configs
   SET pms_enabled = COALESCE(subscription_fee_monthly, 0) > 0,
       commission_enabled = commission_rate IS NOT NULL;