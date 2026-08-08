-- Invoice ledger: ROL bills a property/portfolio for commission + agreement fees
CREATE TABLE public.rol_property_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_kind text NOT NULL DEFAULT 'property',
  portfolio_id uuid REFERENCES public.property_portfolios(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  group_name text NOT NULL,
  group_code text,
  bill_to_email text,
  bill_to_name text,
  bill_to_address text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  subtotal numeric NOT NULL DEFAULT 0,
  vat_rate numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  invoice_reference text UNIQUE,
  vat_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  due_date date,
  pay_token text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  payment_reference text,
  payment_transaction_id uuid,
  notes text,
  void_reason text,
  pdf_path text,
  commission_total numeric NOT NULL DEFAULT 0,
  recurring_total numeric NOT NULL DEFAULT 0,
  charge_total numeric NOT NULL DEFAULT 0,
  adjustment_total numeric NOT NULL DEFAULT 0,
  booking_count integer NOT NULL DEFAULT 0,
  issued_at timestamptz,
  issued_by uuid,
  emailed_at timestamptz,
  paid_at timestamptz,
  paid_by uuid,
  voided_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.rol_property_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.rol_property_invoices(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  property_name text,
  line_kind text NOT NULL DEFAULT 'commission',
  line_date date,
  description text,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  rol_reference text,
  guest_name text,
  check_in_date date,
  check_out_date date,
  settlement_route text,
  commission_type text,
  gross_amount numeric NOT NULL DEFAULT 0,
  rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 1,
  source_kind text,
  source_id text,
  is_waived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rol_property_invoices_group ON public.rol_property_invoices (property_id, portfolio_id, period_start);
CREATE INDEX idx_rol_property_invoices_status ON public.rol_property_invoices (status, period_start DESC);
CREATE INDEX idx_rol_property_invoice_lines_invoice ON public.rol_property_invoice_lines (invoice_id);
CREATE INDEX idx_rol_property_invoice_lines_source ON public.rol_property_invoice_lines (source_kind, source_id);
CREATE UNIQUE INDEX idx_rol_property_invoice_lines_booking_claim
  ON public.rol_property_invoice_lines (booking_id, line_kind)
  WHERE booking_id IS NOT NULL AND line_kind = 'commission';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.rol_property_invoices TO authenticated;
GRANT ALL ON public.rol_property_invoices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rol_property_invoice_lines TO authenticated;
GRANT ALL ON public.rol_property_invoice_lines TO service_role;

ALTER TABLE public.rol_property_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rol_property_invoice_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Billing admins manage property invoices"
  ON public.rol_property_invoices FOR ALL TO authenticated
  USING (public.is_payout_admin(auth.uid()))
  WITH CHECK (public.is_payout_admin(auth.uid()));

CREATE POLICY "Billing admins manage property invoice lines"
  ON public.rol_property_invoice_lines FOR ALL TO authenticated
  USING (public.is_payout_admin(auth.uid()))
  WITH CHECK (public.is_payout_admin(auth.uid()));

CREATE TRIGGER trg_rol_property_invoices_updated_at
  BEFORE UPDATE ON public.rol_property_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.billing_global_defaults
  ADD COLUMN IF NOT EXISTS invoice_due_days integer NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS invoice_footer_note text;