-- Drop existing policies on api_keys table
DROP POLICY IF EXISTS "Admins can delete api keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can insert api keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can update api keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can view api keys" ON public.api_keys;

-- Create new policies that include dev role
CREATE POLICY "Admins and devs can delete api keys" 
ON public.api_keys 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Admins and devs can insert api keys" 
ON public.api_keys 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Admins and devs can update api keys" 
ON public.api_keys 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Admins and devs can view api keys" 
ON public.api_keys 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

-- Drop existing policies on pms_credentials table
DROP POLICY IF EXISTS "Admins can delete pms credentials" ON public.pms_credentials;
DROP POLICY IF EXISTS "Admins can insert pms credentials" ON public.pms_credentials;
DROP POLICY IF EXISTS "Admins can update pms credentials" ON public.pms_credentials;
DROP POLICY IF EXISTS "Admins can view pms credentials" ON public.pms_credentials;

-- Create new policies that include dev role
CREATE POLICY "Admins and devs can delete pms credentials" 
ON public.pms_credentials 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Admins and devs can insert pms credentials" 
ON public.pms_credentials 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Admins and devs can update pms credentials" 
ON public.pms_credentials 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));

CREATE POLICY "Admins and devs can view pms credentials" 
ON public.pms_credentials 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role));