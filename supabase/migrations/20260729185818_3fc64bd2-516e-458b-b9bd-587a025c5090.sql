ALTER TABLE public.property_billing_configs ADD COLUMN IF NOT EXISTS billing_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.portfolio_billing_configs ADD COLUMN IF NOT EXISTS billing_enabled boolean NOT NULL DEFAULT false;

UPDATE public.property_billing_configs c
SET billing_enabled = true
WHERE EXISTS (
  SELECT 1 FROM public.subscription_invoices si
  WHERE si.property_id = c.property_id AND si.status = 'paid'
);

UPDATE public.portfolio_billing_configs c
SET billing_enabled = true
WHERE EXISTS (
  SELECT 1 FROM public.subscription_invoices si
  WHERE si.portfolio_id = c.portfolio_id AND si.status = 'paid'
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_subscription_invoice_property
  ON public.subscription_invoices (property_id, period_start)
  WHERE status = 'pending' AND property_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_subscription_invoice_portfolio
  ON public.subscription_invoices (portfolio_id, period_start)
  WHERE status = 'pending' AND portfolio_id IS NOT NULL;