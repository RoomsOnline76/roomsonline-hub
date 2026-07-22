
ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS white_label_domain_last_error TEXT;

ALTER TABLE public.property_portfolios
  ADD COLUMN IF NOT EXISTS white_label_domain_last_error TEXT;
