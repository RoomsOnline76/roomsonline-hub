
ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS white_label_domain text,
  ADD COLUMN IF NOT EXISTS white_label_domain_status text NOT NULL DEFAULT 'unconfigured',
  ADD COLUMN IF NOT EXISTS white_label_domain_verified_at timestamptz;

COMMENT ON COLUMN public.property_billing_configs.white_label_domain IS 'Custom subdomain (e.g. book.theirdomain.com) that CNAMEs to our hosting for a fully white-labelled booking experience.';
COMMENT ON COLUMN public.property_billing_configs.white_label_domain_status IS 'unconfigured | pending | active | failed';
