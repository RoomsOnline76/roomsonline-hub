-- Drop the restrictive public policy
DROP POLICY IF EXISTS "Public can view active properties" ON public.properties;

-- Create a new policy that allows anyone (authenticated or not) to view active properties
CREATE POLICY "Anyone can view active properties" 
ON public.properties 
FOR SELECT 
USING (is_active = true);