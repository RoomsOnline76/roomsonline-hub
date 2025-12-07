-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Anyone can view availability cache" ON pms_availability_cache;

-- Create a new policy that allows public access for active properties
-- Uses a direct check against properties table with SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.is_property_active(prop_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM properties 
    WHERE id = prop_id AND is_active = true
  );
$$;

-- Create new policy using the function
CREATE POLICY "Anyone can view availability cache for active properties" 
ON pms_availability_cache 
FOR SELECT 
USING (public.is_property_active(property_id));