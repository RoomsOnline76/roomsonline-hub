ALTER TABLE public.property_portfolios
  ADD COLUMN IF NOT EXISTS white_label_domain text,
  ADD COLUMN IF NOT EXISTS white_label_domain_status text NOT NULL DEFAULT 'unconfigured',
  ADD COLUMN IF NOT EXISTS white_label_domain_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_property_portfolios_wl_domain
  ON public.property_portfolios (white_label_domain)
  WHERE white_label_domain IS NOT NULL;