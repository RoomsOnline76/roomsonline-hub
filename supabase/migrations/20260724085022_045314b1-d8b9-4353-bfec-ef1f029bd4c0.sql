DROP POLICY IF EXISTS "Admins can manage billing defaults" ON public.billing_global_defaults;
CREATE POLICY "Admins can manage billing defaults"
  ON public.billing_global_defaults
  FOR ALL
  TO authenticated
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