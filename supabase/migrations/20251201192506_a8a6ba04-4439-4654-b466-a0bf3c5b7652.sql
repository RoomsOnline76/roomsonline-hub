-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Properties are viewable by everyone" ON public.properties;

-- Create new policy for public/unauthenticated viewing (booking site)
CREATE POLICY "Public can view active properties"
ON public.properties
FOR SELECT
USING (is_active = true AND auth.uid() IS NULL);