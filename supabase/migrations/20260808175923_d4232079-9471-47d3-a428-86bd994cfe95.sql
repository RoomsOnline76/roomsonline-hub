-- 1) Plan-change / switch-off tracking on billing configs
ALTER TABLE public.property_billing_configs
  ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_subscription_fee numeric,
  ADD COLUMN IF NOT EXISTS subscription_reset_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_switched_off_at timestamptz;

ALTER TABLE public.portfolio_billing_configs
  ADD COLUMN IF NOT EXISTS plan_changed_at timestamptz,
  ADD COLUMN IF NOT EXISTS previous_subscription_fee numeric,
  ADD COLUMN IF NOT EXISTS subscription_reset_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS billing_switched_off_at timestamptz;

-- 2) Owner read access to their own ROL invoices
GRANT SELECT ON public.rol_property_invoices TO authenticated;
GRANT SELECT ON public.rol_property_invoice_lines TO authenticated;
GRANT SELECT ON public.property_payout_statements TO authenticated;
GRANT SELECT ON public.property_payout_statement_lines TO authenticated;
GRANT SELECT ON public.property_payout_statement_payments TO authenticated;

CREATE POLICY "Owners view their own ROL invoices"
ON public.rol_property_invoices FOR SELECT TO authenticated
USING (
  status <> 'void'
  AND (
    (property_id IS NOT NULL AND (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())))
    OR (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.property_portfolios pp
      WHERE pp.id = rol_property_invoices.portfolio_id AND pp.owner_id = auth.uid()
    ))
    OR (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.property_portfolio_members ppm
      WHERE ppm.portfolio_id = rol_property_invoices.portfolio_id
        AND (is_property_owner(ppm.property_id, auth.uid()) OR is_linked_owner(ppm.property_id, auth.uid()))
    ))
  )
);

CREATE POLICY "Owners view lines of their own ROL invoices"
ON public.rol_property_invoice_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.rol_property_invoices i
  WHERE i.id = rol_property_invoice_lines.invoice_id
));

-- 3) Owner read access to their own payout statements (finalised only)
CREATE POLICY "Owners view their own payout statements"
ON public.property_payout_statements FOR SELECT TO authenticated
USING (
  status NOT IN ('void', 'draft')
  AND (
    (property_id IS NOT NULL AND (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid())))
    OR (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.property_portfolios pp
      WHERE pp.id = property_payout_statements.portfolio_id AND pp.owner_id = auth.uid()
    ))
    OR (portfolio_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.property_portfolio_members ppm
      WHERE ppm.portfolio_id = property_payout_statements.portfolio_id
        AND (is_property_owner(ppm.property_id, auth.uid()) OR is_linked_owner(ppm.property_id, auth.uid()))
    ))
  )
);

CREATE POLICY "Owners view lines of their own payout statements"
ON public.property_payout_statement_lines FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.property_payout_statements s
  WHERE s.id = property_payout_statement_lines.statement_id
));

CREATE POLICY "Owners view payments of their own payout statements"
ON public.property_payout_statement_payments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.property_payout_statements s
  WHERE s.id = property_payout_statement_payments.statement_id
));