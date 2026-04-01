DROP POLICY "Admins and devs can insert properties" ON public.properties;
CREATE POLICY "Admins and devs can insert properties" ON public.properties FOR INSERT TO authenticated WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role)
);