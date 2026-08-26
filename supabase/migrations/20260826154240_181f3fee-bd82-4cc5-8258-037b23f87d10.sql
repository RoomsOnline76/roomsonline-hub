DROP POLICY IF EXISTS "Admins and devs can manage all billing configs" ON public.property_billing_configs;
CREATE POLICY "Staff manage all property billing configs"
ON public.property_billing_configs
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);

DROP POLICY IF EXISTS "Admins and devs manage all portfolio billing configs" ON public.portfolio_billing_configs;
CREATE POLICY "Staff manage all portfolio billing configs"
ON public.portfolio_billing_configs
FOR ALL
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);