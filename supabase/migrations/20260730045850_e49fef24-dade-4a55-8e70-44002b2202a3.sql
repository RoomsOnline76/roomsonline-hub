ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS listing_commission_rate numeric,
  ADD COLUMN IF NOT EXISTS pms_commission_rate numeric;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS listing_commission_rate numeric,
  ADD COLUMN IF NOT EXISTS pms_commission_rate numeric;

ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS listing_commission_rate numeric,
  ADD COLUMN IF NOT EXISTS pms_commission_rate numeric;