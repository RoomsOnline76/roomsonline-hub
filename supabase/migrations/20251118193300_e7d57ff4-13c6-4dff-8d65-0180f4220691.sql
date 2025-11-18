-- Create package-images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('package-images', 'package-images', true);

-- RLS policies for package-images bucket
CREATE POLICY "Admins can upload package images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'package-images' 
  AND (storage.foldername(name))[1] = 'packages'
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can update package images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'package-images'
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Admins can delete package images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'package-images'
  AND has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Anyone can view package images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'package-images');