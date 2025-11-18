-- Update properties RLS policies for role-based access
DROP POLICY IF EXISTS "Admins can view all properties" ON public.properties;
DROP POLICY IF EXISTS "Admins can insert properties" ON public.properties;
DROP POLICY IF EXISTS "Admins can update properties" ON public.properties;
DROP POLICY IF EXISTS "Admins can delete properties" ON public.properties;

-- Admins can do everything
CREATE POLICY "Admins can view all properties" 
ON public.properties 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert properties" 
ON public.properties 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update properties" 
ON public.properties 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete properties" 
ON public.properties 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'));

-- Owners can view their own properties
CREATE POLICY "Owners can view own properties" 
ON public.properties 
FOR SELECT 
USING (
  owner_email IN (
    SELECT email FROM public.profiles WHERE id = auth.uid()
  )
);

-- Owners can update their own properties
CREATE POLICY "Owners can update own properties" 
ON public.properties 
FOR UPDATE 
USING (
  owner_email IN (
    SELECT email FROM public.profiles WHERE id = auth.uid()
  )
);