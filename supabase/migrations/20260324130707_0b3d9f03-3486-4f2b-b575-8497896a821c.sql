
-- 1. Create billing_global_defaults table
CREATE TABLE public.billing_global_defaults (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy billing_strategy NOT NULL UNIQUE,
  default_commission_rate numeric(5,2),
  default_subscription_fee numeric(10,2),
  default_transaction_fee numeric(5,2),
  white_label_monthly_fee numeric(10,2) DEFAULT 0,
  payment_facilitator_fee numeric(5,2) DEFAULT 2.5,
  notes text,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id)
);

-- 2. Add white_label_monthly_fee to property_billing_configs
ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS white_label_monthly_fee numeric(10,2);

-- 3. Enable RLS
ALTER TABLE public.billing_global_defaults ENABLE ROW LEVEL SECURITY;

-- 4. RLS: All authenticated can read
CREATE POLICY "Authenticated users can read billing defaults"
  ON public.billing_global_defaults
  FOR SELECT
  TO authenticated
  USING (true);

-- 5. RLS: Only fearless_leader and dev can write
CREATE POLICY "Admins can manage billing defaults"
  ON public.billing_global_defaults
  FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
  );

-- 6. Seed with current hardcoded defaults
INSERT INTO public.billing_global_defaults (strategy, default_commission_rate, default_subscription_fee, default_transaction_fee, white_label_monthly_fee, payment_facilitator_fee, notes)
VALUES
  ('default', 10.00, NULL, NULL, 0, 2.50, 'Standard 10% listing commission'),
  ('widget', 8.00, NULL, NULL, 0, 2.50, 'Tiered widget commission'),
  ('rolos_pms', 2.00, 500.00, NULL, 0, 2.50, 'Monthly subscription + 2% per-booking'),
  ('portfolio_aggregator', 5.00, NULL, NULL, 0, 2.50, 'Reduced rate for portfolio owners'),
  ('enterprise_white_label', 0, 2500.00, NULL, 500.00, 2.50, 'Flat monthly fee, zero commission'),
  ('volume_tiered', 8.00, NULL, NULL, 0, 2.50, 'Sliding scale based on unit count'),
  ('payment_facilitator', NULL, NULL, 2.50, 0, 2.50, 'Transaction fee only');
