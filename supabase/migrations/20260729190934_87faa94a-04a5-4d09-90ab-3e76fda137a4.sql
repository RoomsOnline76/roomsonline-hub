GRANT SELECT, INSERT, UPDATE, DELETE ON public.integration_configs TO authenticated;
GRANT ALL ON public.integration_configs TO service_role;

DROP POLICY IF EXISTS "Owners can view own integration configs" ON public.integration_configs;
DROP POLICY IF EXISTS "Owners can insert own integration configs" ON public.integration_configs;
DROP POLICY IF EXISTS "Owners can update own integration configs" ON public.integration_configs;
DROP POLICY IF EXISTS "Owners can delete own integration configs" ON public.integration_configs;

CREATE POLICY "Owners can view own integration configs"
ON public.integration_configs FOR SELECT TO authenticated
USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

CREATE POLICY "Owners can insert own integration configs"
ON public.integration_configs FOR INSERT TO authenticated
WITH CHECK (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

CREATE POLICY "Owners can update own integration configs"
ON public.integration_configs FOR UPDATE TO authenticated
USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role))
WITH CHECK (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));

CREATE POLICY "Owners can delete own integration configs"
ON public.integration_configs FOR DELETE TO authenticated
USING (is_property_owner(property_id, auth.uid()) OR is_linked_owner(property_id, auth.uid()) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role) OR has_role(auth.uid(), 'fearless_leader'::app_role));