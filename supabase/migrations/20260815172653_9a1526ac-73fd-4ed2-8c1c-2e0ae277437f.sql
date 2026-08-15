-- The old INSERT policy required storage.objects.owner = auth.uid(). Newer Storage
-- versions populate owner_id (text) and can leave owner NULL, so every upload was
-- rejected with "new row violates row-level security policy".
DROP POLICY IF EXISTS "Signed in users can upload shared images" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders and admins can update shared images" ON storage.objects;
DROP POLICY IF EXISTS "Uploaders and admins can delete shared images" ON storage.objects;

CREATE POLICY "Signed in users can upload shared images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['addon-images','package-images','template-images','portfolio-logos'])
);

CREATE POLICY "Signed in users can update shared images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['addon-images','package-images','template-images','portfolio-logos'])
)
WITH CHECK (
  bucket_id = ANY (ARRAY['addon-images','package-images','template-images','portfolio-logos'])
);

CREATE POLICY "Uploaders and admins can delete shared images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['addon-images','package-images','template-images','portfolio-logos'])
  AND (
    owner = auth.uid()
    OR owner_id = auth.uid()::text
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);