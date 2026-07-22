
ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS cloudflare_custom_hostname_id text,
  ADD COLUMN IF NOT EXISTS custom_domain_error text;

ALTER TABLE public.property_portfolios
  ADD COLUMN IF NOT EXISTS cloudflare_custom_hostname_id text,
  ADD COLUMN IF NOT EXISTS custom_domain_error text;
