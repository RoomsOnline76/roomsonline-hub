-- Drop existing policies
DROP POLICY IF EXISTS "Admins and devs can view access requests" ON public.access_requests;
DROP POLICY IF EXISTS "Admins and devs can update access requests" ON public.access_requests;

-- Recreate with fearless_leader included
CREATE POLICY "Admins devs and fearless leaders can view access requests"
ON public.access_requests FOR SELECT
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'dev'::app_role) OR 
  has_role(auth.uid(), 'fearless_leader'::app_role)
);

CREATE POLICY "Admins devs and fearless leaders can update access requests"
ON public.access_requests FOR UPDATE
TO public
USING (
  has_role(auth.uid(), 'admin'::app_role) OR 
  has_role(auth.uid(), 'dev'::app_role) OR 
  has_role(auth.uid(), 'fearless_leader'::app_role)
);