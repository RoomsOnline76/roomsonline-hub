-- Fix property-images storage policies to include fearless_leader role

-- Drop and recreate INSERT policy
DROP POLICY "Admins and devs can upload property images" ON storage.objects;
CREATE POLICY "Admins and devs can upload property images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'property-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

-- Drop and recreate UPDATE policy
DROP POLICY "Admins and devs can update property images" ON storage.objects;
CREATE POLICY "Admins and devs can update property images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'property-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

-- Drop and recreate DELETE policy
DROP POLICY "Admins and devs can delete property images" ON storage.objects;
CREATE POLICY "Admins and devs can delete property images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'property-images' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

-- Fix hero-videos storage policies to include fearless_leader role

-- Drop and recreate INSERT policy
DROP POLICY "Admins and devs can upload hero videos" ON storage.objects;
CREATE POLICY "Admins and devs can upload hero videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'hero-videos' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

-- Drop and recreate UPDATE policy
DROP POLICY "Admins and devs can update hero videos" ON storage.objects;
CREATE POLICY "Admins and devs can update hero videos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'hero-videos' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

-- Drop and recreate DELETE policy
DROP POLICY "Admins and devs can delete hero videos" ON storage.objects;
CREATE POLICY "Admins and devs can delete hero videos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'hero-videos' AND (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'dev'::app_role) OR 
    has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);