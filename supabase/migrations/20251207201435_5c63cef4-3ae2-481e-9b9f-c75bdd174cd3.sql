-- Add RLS policy to allow public read access to active properties
CREATE POLICY "Public can view active properties" 
ON properties 
FOR SELECT 
USING (is_active = true);