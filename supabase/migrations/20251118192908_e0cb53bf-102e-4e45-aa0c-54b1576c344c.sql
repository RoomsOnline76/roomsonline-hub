-- Create storage bucket for addon images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('addon-images', 'addon-images', true);

-- RLS Policies for addon-images bucket
-- Allow authenticated users to view addon images
CREATE POLICY "Addon images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'addon-images');

-- Allow admin users to upload addon images
CREATE POLICY "Admins can upload addon images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'addon-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admin users to update addon images
CREATE POLICY "Admins can update addon images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'addon-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);

-- Allow admin users to delete addon images
CREATE POLICY "Admins can delete addon images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'addon-images' 
  AND has_role(auth.uid(), 'admin'::app_role)
);