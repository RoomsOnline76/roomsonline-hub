
-- Billing Engine Schema

CREATE TYPE billing_strategy AS ENUM (
  'default', 'widget', 'rolos_pms', 'portfolio_aggregator',
  'enterprise_white_label', 'volume_tiered', 'payment_facilitator'
);

CREATE TABLE property_billing_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE UNIQUE NOT NULL,
  owner_id uuid REFERENCES profiles(id),
  billing_strategy billing_strategy NOT NULL DEFAULT 'default',
  commission_rate numeric(5,2),
  subscription_fee_monthly numeric(10,2),
  transaction_fee_percentage numeric(5,2),
  payment_facilitator_enabled boolean DEFAULT false,
  white_label_allowed boolean DEFAULT false,
  volume_tier_json jsonb,
  billing_start_date date,
  linked_contract_id uuid REFERENCES contract_template_versions(id),
  custom_overrides jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE property_billing_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage all billing configs"
  ON property_billing_configs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can view their own billing configs"
  ON property_billing_configs FOR SELECT TO authenticated
  USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()));

CREATE TRIGGER update_billing_configs_updated_at
  BEFORE UPDATE ON property_billing_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE billing_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES properties(id),
  owner_id uuid REFERENCES profiles(id),
  type text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text DEFAULT 'ZAR',
  reference_id uuid,
  calculated_by text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE billing_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage all billing transactions"
  ON billing_transactions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can view their own billing transactions"
  ON billing_transactions FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE INDEX idx_billing_transactions_property ON billing_transactions(property_id);
CREATE INDEX idx_billing_transactions_owner ON billing_transactions(owner_id);
CREATE INDEX idx_billing_transactions_created ON billing_transactions(created_at);

CREATE TABLE owner_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid REFERENCES profiles(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_commission numeric(12,2),
  total_fees numeric(12,2),
  net_payout numeric(12,2),
  status text DEFAULT 'draft',
  pdf_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE owner_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage all invoices"
  ON owner_invoices FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Owners can view their own invoices"
  ON owner_invoices FOR SELECT TO authenticated
  USING (owner_id = auth.uid());

CREATE TABLE billing_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy billing_strategy,
  field text,
  value text,
  description text
);

ALTER TABLE billing_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and devs can manage billing mappings"
  ON billing_mappings FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'dev'));

CREATE POLICY "Authenticated users can view billing mappings"
  ON billing_mappings FOR SELECT TO authenticated
  USING (true);

-- Seed existing properties with default billing config
INSERT INTO property_billing_configs (property_id, billing_strategy, commission_rate)
SELECT id, 'default', 10
FROM properties
ON CONFLICT (property_id) DO NOTHING;
