-- Drop the problematic policy that references auth.users
DROP POLICY IF EXISTS "Authenticated users can view availability for accessible properties" ON property_availability;

-- Create a fixed SELECT policy using auth.email() instead of querying auth.users
CREATE POLICY "Users can view availability for accessible properties" 
ON property_availability 
FOR SELECT 
USING (
  auth.uid() IS NOT NULL AND (
    -- Property owner (using auth.email() function)
    EXISTS (
      SELECT 1 FROM properties p 
      WHERE p.id = property_availability.property_id 
      AND p.owner_email = auth.email()
    )
    -- Or admin/dev
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

-- Add INSERT policy for property owners
CREATE POLICY "Owners can insert availability for their properties" 
ON property_availability 
FOR INSERT 
WITH CHECK (
  auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM properties p 
      WHERE p.id = property_availability.property_id 
      AND p.owner_email = auth.email()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

-- Add UPDATE policy for property owners
CREATE POLICY "Owners can update availability for their properties" 
ON property_availability 
FOR UPDATE 
USING (
  auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM properties p 
      WHERE p.id = property_availability.property_id 
      AND p.owner_email = auth.email()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

-- Add DELETE policy for property owners
CREATE POLICY "Owners can delete availability for their properties" 
ON property_availability 
FOR DELETE 
USING (
  auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM properties p 
      WHERE p.id = property_availability.property_id 
      AND p.owner_email = auth.email()
    )
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);