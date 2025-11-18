-- Create property_images storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-images', 'property-images', true);

-- RLS policies for property_images bucket
CREATE POLICY "Admins can upload property images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'property-images' AND
  (SELECT COUNT(*) FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') > 0
);

CREATE POLICY "Admins can update property images"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'property-images' AND
  (SELECT COUNT(*) FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') > 0
);

CREATE POLICY "Admins can delete property images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'property-images' AND
  (SELECT COUNT(*) FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin') > 0
);

CREATE POLICY "Anyone can view property images"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'property-images');