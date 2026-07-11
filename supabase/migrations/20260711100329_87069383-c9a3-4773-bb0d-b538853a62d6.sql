-- Allow property owners (and any authenticated user) to upload/update/delete
-- addon-images and package-images. Buckets are public-read and only exposed
-- inside the authenticated property-edit UI.

DROP POLICY IF EXISTS "Authenticated users can upload addon images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update addon images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete addon images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload package images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update package images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete package images" ON storage.objects;

CREATE POLICY "Authenticated users can upload addon images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'addon-images');

CREATE POLICY "Authenticated users can update addon images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'addon-images');

CREATE POLICY "Authenticated users can delete addon images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'addon-images');

CREATE POLICY "Authenticated users can upload package images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'package-images');

CREATE POLICY "Authenticated users can update package images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'package-images');

CREATE POLICY "Authenticated users can delete package images"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'package-images');