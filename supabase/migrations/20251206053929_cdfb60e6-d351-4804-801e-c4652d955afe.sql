-- Drop any existing SELECT policies on access_requests to clean up
DROP POLICY IF EXISTS "Anyone can view access requests" ON public.access_requests;
DROP POLICY IF EXISTS "Public can view access requests" ON public.access_requests;

-- Ensure the admin-only SELECT policy exists (recreate to be safe)
DROP POLICY IF EXISTS "Admins can view access requests" ON public.access_requests;
CREATE POLICY "Admins can view access requests"
ON public.access_requests
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));