-- Add policy for authenticated users to read property_availability for properties they own or have access to
CREATE POLICY "Authenticated users can view availability for accessible properties" 
ON property_availability 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Property owner
    EXISTS (
      SELECT 1 FROM properties p 
      WHERE p.id = property_availability.property_id 
      AND p.owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
    )
    -- Or admin/dev
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);