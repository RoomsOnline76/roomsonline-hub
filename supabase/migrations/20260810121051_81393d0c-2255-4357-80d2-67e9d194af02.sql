GRANT SELECT ON public.ru_mcq_orders TO authenticated;
GRANT ALL ON public.ru_mcq_orders TO service_role;

CREATE POLICY "Property team can view content quality results"
ON public.ru_mcq_orders
FOR SELECT
TO authenticated
USING (property_id IS NOT NULL AND public.can_access_property(property_id, auth.uid()));