-- Drop existing INSERT policies for storage and recreate with admin OR dev access

-- Drop existing policies
DROP POLICY IF EXISTS "Admins can upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update property images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete property images" ON storage.objects;

DROP POLICY IF EXISTS "Admins can upload addon images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update addon images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete addon images" ON storage.objects;

DROP POLICY IF EXISTS "Admins can upload package images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update package images" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete package images" ON storage.objects;

-- Recreate policies to allow admin OR dev users

-- Property images
CREATE POLICY "Admins and devs can upload property images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'property-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

CREATE POLICY "Admins and devs can update property images" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'property-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

CREATE POLICY "Admins and devs can delete property images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'property-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

-- Addon images
CREATE POLICY "Admins and devs can upload addon images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'addon-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

CREATE POLICY "Admins and devs can update addon images" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'addon-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

CREATE POLICY "Admins and devs can delete addon images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'addon-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

-- Package images
CREATE POLICY "Admins and devs can upload package images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'package-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

CREATE POLICY "Admins and devs can update package images" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'package-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);

CREATE POLICY "Admins and devs can delete package images" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'package-images' 
  AND (
    has_role(auth.uid(), 'admin'::app_role) 
    OR has_role(auth.uid(), 'dev'::app_role)
  )
);