-- ============ portfolio payout mode + VAT defaults ============
ALTER TABLE public.property_portfolios
  ADD COLUMN IF NOT EXISTS payout_mode text NOT NULL DEFAULT 'consolidated';

ALTER TABLE public.property_portfolios
  ADD CONSTRAINT property_portfolios_payout_mode_chk
  CHECK (payout_mode IN ('consolidated','split'));

ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS vat_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_rate numeric NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS vat_number text,
  ADD COLUMN IF NOT EXISTS company_legal_name text,
  ADD COLUMN IF NOT EXISTS company_address text;

-- ============ helper: is this user a payout admin ============
CREATE OR REPLACE FUNCTION public.is_payout_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'dev'::app_role)
      OR public.has_role(_user_id, 'fearless_leader'::app_role)
$$;

-- ============ statements ============
CREATE TABLE public.property_payout_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_kind text NOT NULL CHECK (group_kind IN ('portfolio','property')),
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  group_name text NOT NULL,
  owner_email text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  payout_mode text NOT NULL DEFAULT 'consolidated' CHECK (payout_mode IN ('consolidated','split')),
  currency text NOT NULL DEFAULT 'ZAR',

  gross_amount numeric NOT NULL DEFAULT 0,
  rol_gross numeric NOT NULL DEFAULT 0,
  byo_gross numeric NOT NULL DEFAULT 0,
  rol_commission numeric NOT NULL DEFAULT 0,
  byo_commission numeric NOT NULL DEFAULT 0,
  ota_commission numeric NOT NULL DEFAULT 0,
  transaction_fees numeric NOT NULL DEFAULT 0,
  recurring_fees numeric NOT NULL DEFAULT 0,
  other_recoveries numeric NOT NULL DEFAULT 0,
  adjustments numeric NOT NULL DEFAULT 0,

  invoice_subtotal numeric NOT NULL DEFAULT 0,
  invoice_vat numeric NOT NULL DEFAULT 0,
  invoice_total numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0,

  opening_balance numeric NOT NULL DEFAULT 0,
  amount_held numeric NOT NULL DEFAULT 0,
  net_payable numeric NOT NULL DEFAULT 0,
  carry_forward numeric NOT NULL DEFAULT 0,

  booking_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','finalised','paid','void')),
  statement_reference text,
  invoice_reference text,
  payment_reference text,
  statement_pdf_path text,
  invoice_pdf_path text,
  notes text,
  finalised_at timestamptz,
  finalised_by uuid,
  paid_at timestamptz,
  paid_by uuid,
  bank_payment_reference text,
  emailed_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX property_payout_statements_portfolio_period_key
  ON public.property_payout_statements (portfolio_id, period_start, period_end)
  WHERE portfolio_id IS NOT NULL AND status <> 'void';

CREATE UNIQUE INDEX property_payout_statements_property_period_key
  ON public.property_payout_statements (property_id, period_start, period_end)
  WHERE group_kind = 'property' AND property_id IS NOT NULL AND status <> 'void';

CREATE INDEX property_payout_statements_period_idx
  ON public.property_payout_statements (period_start, period_end);
CREATE INDEX property_payout_statements_status_idx
  ON public.property_payout_statements (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_payout_statements TO authenticated;
GRANT ALL ON public.property_payout_statements TO service_role;
ALTER TABLE public.property_payout_statements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payout admins manage statements"
  ON public.property_payout_statements FOR ALL TO authenticated
  USING (public.is_payout_admin(auth.uid()))
  WITH CHECK (public.is_payout_admin(auth.uid()));

-- ============ statement lines ============
CREATE TABLE public.property_payout_statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.property_payout_statements(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  property_name text,
  line_kind text NOT NULL CHECK (line_kind IN ('booking','recovery','charge','adjustment','opening_balance')),
  line_date date,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  payment_transaction_id uuid REFERENCES public.payment_transactions(id) ON DELETE SET NULL,
  rol_reference text,
  description text,
  guest_name text,
  check_in_date date,
  check_out_date date,
  settlement_route text,
  commission_type text,
  gross_amount numeric NOT NULL DEFAULT 0,
  commission_rate numeric NOT NULL DEFAULT 0,
  commission_amount numeric NOT NULL DEFAULT 0,
  fee_amount numeric NOT NULL DEFAULT 0,
  net_amount numeric NOT NULL DEFAULT 0,
  is_recoverable boolean NOT NULL DEFAULT false,
  source_kind text,
  source_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX property_payout_statement_lines_tx_key
  ON public.property_payout_statement_lines (payment_transaction_id)
  WHERE payment_transaction_id IS NOT NULL;

CREATE UNIQUE INDEX property_payout_statement_lines_booking_key
  ON public.property_payout_statement_lines (booking_id)
  WHERE booking_id IS NOT NULL AND line_kind = 'booking';

CREATE INDEX property_payout_statement_lines_statement_idx
  ON public.property_payout_statement_lines (statement_id);
CREATE INDEX property_payout_statement_lines_property_idx
  ON public.property_payout_statement_lines (property_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_payout_statement_lines TO authenticated;
GRANT ALL ON public.property_payout_statement_lines TO service_role;
ALTER TABLE public.property_payout_statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payout admins manage statement lines"
  ON public.property_payout_statement_lines FOR ALL TO authenticated
  USING (public.is_payout_admin(auth.uid()))
  WITH CHECK (public.is_payout_admin(auth.uid()));

-- ============ statement payments ============
CREATE TABLE public.property_payout_statement_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES public.property_payout_statements(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  beneficiary_name text,
  bank_name text,
  branch_code text,
  account_number_masked text,
  account_type text,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  payment_reference text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX property_payout_statement_payments_statement_idx
  ON public.property_payout_statement_payments (statement_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_payout_statement_payments TO authenticated;
GRANT ALL ON public.property_payout_statement_payments TO service_role;
ALTER TABLE public.property_payout_statement_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payout admins manage statement payments"
  ON public.property_payout_statement_payments FOR ALL TO authenticated
  USING (public.is_payout_admin(auth.uid()))
  WITH CHECK (public.is_payout_admin(auth.uid()));

-- ============ updated_at triggers ============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_payout_statements_touch
  BEFORE UPDATE ON public.property_payout_statements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER trg_payout_statement_payments_touch
  BEFORE UPDATE ON public.property_payout_statement_payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ reference minting ============
CREATE TABLE public.payout_reference_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL UNIQUE,
  last_value integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payout_reference_counters TO authenticated;
GRANT ALL ON public.payout_reference_counters TO service_role;
ALTER TABLE public.payout_reference_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payout admins read counters"
  ON public.payout_reference_counters FOR SELECT TO authenticated
  USING (public.is_payout_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.next_payout_reference(_kind text, _group_code text, _period text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix text;
  v_scope text;
  v_next integer;
BEGIN
  v_prefix := CASE lower(_kind)
    WHEN 'statement' THEN 'STMT'
    WHEN 'invoice' THEN 'INV'
    WHEN 'payment' THEN 'PAY'
    ELSE upper(left(coalesce(_kind,'X'), 4))
  END;

  v_scope := v_prefix || ':' || upper(coalesce(_group_code,'GEN')) || ':' || coalesce(_period,'000000');

  INSERT INTO public.payout_reference_counters (scope_key, last_value)
  VALUES (v_scope, 1)
  ON CONFLICT (scope_key)
  DO UPDATE SET last_value = public.payout_reference_counters.last_value + 1,
                updated_at = now()
  RETURNING last_value INTO v_next;

  RETURN 'ROL-' || v_prefix || '-' || upper(coalesce(_group_code,'GEN')) || '-'
         || coalesce(_period,'000000') || '-' || lpad(v_next::text, 2, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_payout_reference(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_payout_reference(text, text, text) TO service_role;