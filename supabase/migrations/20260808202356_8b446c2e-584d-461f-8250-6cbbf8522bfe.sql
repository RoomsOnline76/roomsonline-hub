CREATE TABLE public.billing_config_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  owner_id uuid,
  changed_by uuid,
  change_type text NOT NULL DEFAULT 'setup_delta',
  before_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  setup_delta numeric NOT NULL DEFAULT 0,
  setup_delta_lines jsonb NOT NULL DEFAULT '[]'::jsonb,
  previous_monthly_fee numeric,
  new_monthly_fee numeric,
  plan_effective_date date,
  invoice_id uuid REFERENCES public.subscription_invoices(id) ON DELETE SET NULL,
  requires_credit_note boolean NOT NULL DEFAULT false,
  notification_status text NOT NULL DEFAULT 'pending',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.billing_config_change_log TO authenticated;
GRANT ALL ON public.billing_config_change_log TO service_role;

ALTER TABLE public.billing_config_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff manage billing change log"
ON public.billing_config_change_log FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);

CREATE POLICY "Owners view their billing change log"
ON public.billing_config_change_log FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()))
);

CREATE INDEX idx_billing_change_log_property ON public.billing_config_change_log(property_id, created_at DESC);
CREATE INDEX idx_billing_change_log_portfolio ON public.billing_config_change_log(portfolio_id, created_at DESC);

CREATE TRIGGER update_billing_config_change_log_updated_at
BEFORE UPDATE ON public.billing_config_change_log
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS pending_monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS pending_model_json jsonb,
  ADD COLUMN IF NOT EXISTS pending_effective_date date,
  ADD COLUMN IF NOT EXISTS plan_change_reason text;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS pending_monthly_fee numeric,
  ADD COLUMN IF NOT EXISTS pending_model_json jsonb,
  ADD COLUMN IF NOT EXISTS pending_effective_date date,
  ADD COLUMN IF NOT EXISTS plan_change_reason text;