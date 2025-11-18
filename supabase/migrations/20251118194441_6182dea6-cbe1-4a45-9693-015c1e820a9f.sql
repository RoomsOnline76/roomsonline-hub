-- Add RLS policies for admin users to manage properties

-- Allow admins to insert properties
CREATE POLICY "Admins can insert properties"
ON public.properties
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to update properties
CREATE POLICY "Admins can update properties"
ON public.properties
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to delete properties
CREATE POLICY "Admins can delete properties"
ON public.properties
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all properties (including inactive ones)
CREATE POLICY "Admins can view all properties"
ON public.properties
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));