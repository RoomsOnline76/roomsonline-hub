-- Allow public/anonymous users to view active properties
CREATE POLICY "Anyone can view active properties" 
ON public.properties
FOR SELECT
USING (is_active = true AND permanently_deleted_at IS NULL);