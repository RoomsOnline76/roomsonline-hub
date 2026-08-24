CREATE TABLE public.gateway_billing_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  model text NOT NULL DEFAULT 'flat',
  base_percentage numeric NOT NULL DEFAULT 0,
  fixed_fee_per_txn numeric,
  monthly_platform_fee numeric,
  passthrough_markup_percentage numeric,
  volume_tiers jsonb NOT NULL DEFAULT '[]'::jsonb,
  currency text NOT NULL DEFAULT 'ZAR',
  notes text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT gateway_billing_configs_model_check CHECK (model IN ('flat','hybrid','volume_tiered','passthrough_plus')),
  CONSTRAINT gateway_billing_configs_name_version_key UNIQUE (name, version)
);

GRANT SELECT ON public.gateway_billing_configs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.gateway_billing_configs TO authenticated;
GRANT ALL ON public.gateway_billing_configs TO service_role;

ALTER TABLE public.gateway_billing_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read gateway billing schedules"
ON public.gateway_billing_configs FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Elevated roles manage gateway billing schedules"
ON public.gateway_billing_configs FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'dev') OR
  public.has_role(auth.uid(), 'fearless_leader')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'dev') OR
  public.has_role(auth.uid(), 'fearless_leader')
);

CREATE TRIGGER update_gateway_billing_configs_updated_at
BEFORE UPDATE ON public.gateway_billing_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE UNIQUE INDEX gateway_billing_configs_single_active
ON public.gateway_billing_configs (is_active)
WHERE is_active = true;

INSERT INTO public.gateway_billing_configs
  (name, version, is_active, model, base_percentage, fixed_fee_per_txn, monthly_platform_fee, volume_tiers, notes)
VALUES (
  'Standard Gateway Schedule',
  1,
  true,
  'hybrid',
  3.9,
  2.50,
  0,
  '[
    {"min_monthly_volume": 0, "max_monthly_volume": 50000, "percentage": 3.9, "fixed_fee": 2.50},
    {"min_monthly_volume": 50000.01, "max_monthly_volume": 250000, "percentage": 3.6, "fixed_fee": 2.00},
    {"min_monthly_volume": 250000.01, "max_monthly_volume": null, "percentage": 3.4, "fixed_fee": 1.50}
  ]'::jsonb,
  'Default schedule sized against PayFast aggregation cost (3.2% + R2 per transaction).'
);

ALTER TABLE public.property_billing_configs
  ADD COLUMN gateway_billing_config_id uuid REFERENCES public.gateway_billing_configs(id),
  ADD COLUMN gateway_percentage_override numeric,
  ADD COLUMN gateway_fixed_fee_override numeric;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN gateway_billing_config_id uuid REFERENCES public.gateway_billing_configs(id),
  ADD COLUMN gateway_percentage_override numeric,
  ADD COLUMN gateway_fixed_fee_override numeric;