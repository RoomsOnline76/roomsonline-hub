-- Fix 1: Public buckets - remove broad listing policies. Files remain accessible via public URL, but listing directory contents is disallowed.
DROP POLICY IF EXISTS "Authenticated can list addon images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list hero videos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list package images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list property images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can list template images" ON storage.objects;
DROP POLICY IF EXISTS "Public read access for portfolio logos" ON storage.objects;

-- Fix 2: Invoices bucket - restrict INSERT to service_role and admins only.
DROP POLICY IF EXISTS "invoices_insert_service" ON storage.objects;
CREATE POLICY "invoices_insert_admin_or_service"
ON storage.objects FOR INSERT
TO authenticated, service_role
WITH CHECK (
  bucket_id = 'invoices'
  AND (
    auth.role() = 'service_role'
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

-- Fix 3: meal_type_suggestions - restrict INSERT to admin/dev roles.
DROP POLICY IF EXISTS "Authenticated users can insert meal type suggestions" ON public.meal_type_suggestions;
CREATE POLICY "Admins can insert meal type suggestions"
ON public.meal_type_suggestions FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);