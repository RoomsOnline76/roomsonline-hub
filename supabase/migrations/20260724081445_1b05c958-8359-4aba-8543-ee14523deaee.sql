ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS enterprise_custom_fee numeric;

ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS enterprise_custom_fee numeric;