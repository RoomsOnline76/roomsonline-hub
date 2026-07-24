-- Extend billing config tables with subscription status
ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS current_period_end date,
  ADD COLUMN IF NOT EXISTS last_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS subscription_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS current_period_end date,
  ADD COLUMN IF NOT EXISTS last_invoice_id uuid,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

ALTER TABLE public.property_billing_configs
  DROP CONSTRAINT IF EXISTS property_billing_configs_subscription_status_check;
ALTER TABLE public.property_billing_configs
  ADD CONSTRAINT property_billing_configs_subscription_status_check
  CHECK (subscription_status IN ('pending','active','past_due','cancelled'));

ALTER TABLE public.portfolio_billing_configs
  DROP CONSTRAINT IF EXISTS portfolio_billing_configs_subscription_status_check;
ALTER TABLE public.portfolio_billing_configs
  ADD CONSTRAINT portfolio_billing_configs_subscription_status_check
  CHECK (subscription_status IN ('pending','active','past_due','cancelled'));

-- Subscription invoices
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  owner_id uuid REFERENCES public.profiles(id),
  amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  invoice_kind text NOT NULL DEFAULT 'activation',
  payfast_payment_id text,
  payfast_token text NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  email_sent_at timestamptz,
  paid_at timestamptz,
  reminder_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscription_invoices_status_check CHECK (status IN ('pending','paid','failed','cancelled')),
  CONSTRAINT subscription_invoices_kind_check CHECK (invoice_kind IN ('activation','renewal')),
  CONSTRAINT subscription_invoices_scope_check CHECK (
    (property_id IS NOT NULL AND portfolio_id IS NULL) OR
    (property_id IS NULL AND portfolio_id IS NOT NULL)
  )
);

GRANT SELECT ON public.subscription_invoices TO authenticated;
GRANT ALL ON public.subscription_invoices TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS subscription_invoices_token_key ON public.subscription_invoices(payfast_token);
CREATE INDEX IF NOT EXISTS subscription_invoices_property_idx ON public.subscription_invoices(property_id);
CREATE INDEX IF NOT EXISTS subscription_invoices_portfolio_idx ON public.subscription_invoices(portfolio_id);
CREATE INDEX IF NOT EXISTS subscription_invoices_status_idx ON public.subscription_invoices(status);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage subscription invoices" ON public.subscription_invoices;
CREATE POLICY "Admins manage subscription invoices" ON public.subscription_invoices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

DROP POLICY IF EXISTS "Owners view their subscription invoices" ON public.subscription_invoices;
CREATE POLICY "Owners view their subscription invoices" ON public.subscription_invoices
  FOR SELECT TO authenticated
  USING (
    owner_id = auth.uid()
    OR (property_id IS NOT NULL AND is_property_owner(property_id, auth.uid()))
    OR (portfolio_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.property_portfolios pp
        WHERE pp.id = portfolio_id AND pp.owner_id = auth.uid()
    ))
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.subscription_invoices_touch() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS subscription_invoices_touch ON public.subscription_invoices;
CREATE TRIGGER subscription_invoices_touch BEFORE UPDATE ON public.subscription_invoices
FOR EACH ROW EXECUTE FUNCTION public.subscription_invoices_touch();

-- Public RPC for pay page (token-based)
CREATE OR REPLACE FUNCTION public.get_subscription_invoice_by_token(_token text)
RETURNS TABLE (
  id uuid, property_id uuid, portfolio_id uuid,
  amount numeric, currency text,
  period_start date, period_end date,
  status text, invoice_kind text,
  entity_name text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT si.id, si.property_id, si.portfolio_id, si.amount, si.currency,
         si.period_start, si.period_end, si.status, si.invoice_kind,
         COALESCE(p.name, pf.name, 'Subscription')
  FROM public.subscription_invoices si
  LEFT JOIN public.properties p ON p.id = si.property_id
  LEFT JOIN public.property_portfolios pf ON pf.id = si.portfolio_id
  WHERE si.payfast_token = _token
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_subscription_invoice_by_token(text) TO anon, authenticated;

-- Cancel via token (owner clicks Cancel on pay page)
CREATE OR REPLACE FUNCTION public.cancel_subscription_by_token(_token text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _inv public.subscription_invoices%ROWTYPE;
BEGIN
  SELECT * INTO _inv FROM public.subscription_invoices WHERE payfast_token = _token LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.subscription_invoices SET status='cancelled' WHERE id=_inv.id AND status='pending';
  IF _inv.property_id IS NOT NULL THEN
    UPDATE public.property_billing_configs
      SET subscription_status='cancelled', cancelled_at=now()
      WHERE property_id=_inv.property_id;
  ELSE
    UPDATE public.portfolio_billing_configs
      SET subscription_status='cancelled', cancelled_at=now()
      WHERE portfolio_id=_inv.portfolio_id;
  END IF;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.cancel_subscription_by_token(text) TO anon, authenticated;

-- Schedule daily cron
DO $$
DECLARE _proj text := 'qmprswbgkpzcvexmmcbf';
        _anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcHJzd2Jna3B6Y3ZleG1tY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODc1NzIsImV4cCI6MjA3OTA2MzU3Mn0.huhYl5OInMevQp7EYHgv8uiLPpWiRrZvy1J7euCEX-g';
BEGIN
  PERFORM cron.unschedule('billing-subscription-cron') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='billing-subscription-cron');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'billing-subscription-cron',
  '0 6 * * *',
  $$SELECT net.http_post(
      url:='https://qmprswbgkpzcvexmmcbf.supabase.co/functions/v1/billing-subscription-cron',
      headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtcHJzd2Jna3B6Y3ZleG1tY2JmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0ODc1NzIsImV4cCI6MjA3OTA2MzU3Mn0.huhYl5OInMevQp7EYHgv8uiLPpWiRrZvy1J7euCEX-g"}'::jsonb,
      body:='{"scheduled":true}'::jsonb
  );$$
);