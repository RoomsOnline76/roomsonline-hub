-- Drop the existing policy
DROP POLICY IF EXISTS "Property owners can manage their brand config" ON public.rolos_brand_config;

-- Create updated policy that also checks is_property_owner (owner_email match)
CREATE POLICY "Property owners can manage their brand config" ON public.rolos_brand_config
FOR ALL TO authenticated
USING (
  is_property_owner(property_id, auth.uid()) OR
  is_linked_owner(property_id, auth.uid()) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'dev'::app_role)
)
WITH CHECK (
  is_property_owner(property_id, auth.uid()) OR
  is_linked_owner(property_id, auth.uid()) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'dev'::app_role)
);