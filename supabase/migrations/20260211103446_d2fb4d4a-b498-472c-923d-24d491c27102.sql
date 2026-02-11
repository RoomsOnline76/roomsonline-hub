-- Fix addon-images storage policies to include fearless_leader

DROP POLICY "Admins and devs can upload addon images" ON storage.objects;
CREATE POLICY "Admins and devs can upload addon images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'addon-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

DROP POLICY "Admins and devs can update addon images" ON storage.objects;
CREATE POLICY "Admins and devs can update addon images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'addon-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

DROP POLICY "Admins and devs can delete addon images" ON storage.objects;
CREATE POLICY "Admins and devs can delete addon images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'addon-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

-- Fix package-images storage policies to include fearless_leader

DROP POLICY "Admins and devs can upload package images" ON storage.objects;
CREATE POLICY "Admins and devs can upload package images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'package-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

DROP POLICY "Admins and devs can update package images" ON storage.objects;
CREATE POLICY "Admins and devs can update package images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'package-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

DROP POLICY "Admins and devs can delete package images" ON storage.objects;
CREATE POLICY "Admins and devs can delete package images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'package-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);