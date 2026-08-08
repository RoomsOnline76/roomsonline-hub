CREATE OR REPLACE FUNCTION public.get_rol_property_invoice_by_token(_token text)
RETURNS TABLE (
  id uuid,
  invoice_reference text,
  group_name text,
  bill_to_name text,
  period_start date,
  period_end date,
  due_date date,
  currency text,
  subtotal numeric,
  vat_rate numeric,
  vat_amount numeric,
  total numeric,
  amount_paid numeric,
  status text,
  commission_total numeric,
  recurring_total numeric,
  charge_total numeric,
  adjustment_total numeric,
  booking_count integer,
  lines jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    i.id, i.invoice_reference, i.group_name, i.bill_to_name,
    i.period_start, i.period_end, i.due_date, i.currency,
    i.subtotal, i.vat_rate, i.vat_amount, i.total, i.amount_paid,
    i.status, i.commission_total, i.recurring_total, i.charge_total,
    i.adjustment_total, i.booking_count,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'line_kind', l.line_kind,
        'description', l.description,
        'property_name', l.property_name,
        'amount', l.amount
      ) ORDER BY l.line_kind, l.line_date)
      FROM public.rol_property_invoice_lines l
      WHERE l.invoice_id = i.id AND COALESCE(l.is_waived, false) = false
    ), '[]'::jsonb) AS lines
  FROM public.rol_property_invoices i
  WHERE i.pay_token = _token
    AND i.status <> 'void'
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_rol_property_invoice_by_token(text) TO anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS rol_property_invoices_pay_token_key
  ON public.rol_property_invoices (pay_token) WHERE pay_token IS NOT NULL;