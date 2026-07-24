CREATE TABLE public.portfolio_billing_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  portfolio_id UUID NOT NULL UNIQUE REFERENCES public.property_portfolios(id) ON DELETE CASCADE,
  billing_strategy billing_strategy NOT NULL DEFAULT 'default',
  commission_rate NUMERIC(5,2),
  subscription_fee_monthly NUMERIC(10,2),
  transaction_fee_percentage NUMERIC(5,2),
  payment_facilitator_enabled BOOLEAN DEFAULT false,
  white_label_allowed BOOLEAN DEFAULT false,
  white_label_monthly_fee NUMERIC(10,2),
  white_label_setup_fee NUMERIC,
  white_label_billing_mode TEXT,
  white_label_domain TEXT,
  white_label_domain_status TEXT NOT NULL DEFAULT 'unconfigured',
  white_label_domain_verified_at TIMESTAMPTZ,
  white_label_domain_last_error TEXT,
  cloudflare_custom_hostname_id TEXT,
  custom_domain_error TEXT,
  branding_addon_enabled BOOLEAN DEFAULT false,
  branding_addon_monthly_fee NUMERIC,
  branding_addon_setup_fee NUMERIC,
  branding_addon_billing_mode TEXT,
  pricelabs_allowed BOOLEAN NOT NULL DEFAULT false,
  pricelabs_monthly_fee NUMERIC,
  pricelabs_setup_fee NUMERIC,
  channel_manager_enabled BOOLEAN DEFAULT false,
  channel_manager_per_unit_fee NUMERIC,
  byo_gateway_monthly_fee NUMERIC,
  widget_flat_commission_rate NUMERIC(5,2),
  enterprise_custom_fee NUMERIC,
  volume_tier_json JSONB,
  tier_pricing_json JSONB,
  room_count_override INTEGER,
  billing_start_date DATE,
  linked_contract_id UUID REFERENCES public.contract_template_versions(id),
  custom_overrides JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_billing_configs TO authenticated;
GRANT ALL ON public.portfolio_billing_configs TO service_role;

ALTER TABLE public.portfolio_billing_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs manage all portfolio billing configs"
  ON public.portfolio_billing_configs
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Portfolio owners view their portfolio billing config"
  ON public.portfolio_billing_configs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.property_portfolios pp
      WHERE pp.id = portfolio_billing_configs.portfolio_id
        AND pp.owner_id = auth.uid()
    )
  );

CREATE POLICY "Property owners view their portfolio's billing config"
  ON public.portfolio_billing_configs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.property_portfolio_members ppm
      WHERE ppm.portfolio_id = portfolio_billing_configs.portfolio_id
        AND (public.is_property_owner(ppm.property_id, auth.uid())
             OR public.is_linked_owner(ppm.property_id, auth.uid()))
    )
  );

CREATE TRIGGER update_portfolio_billing_configs_updated_at
  BEFORE UPDATE ON public.portfolio_billing_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_portfolio_billing_configs_portfolio_id ON public.portfolio_billing_configs(portfolio_id);