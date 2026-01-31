-- Drop the broken policies and recreate with correct column reference
DROP POLICY IF EXISTS "Owners can upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update property images" ON storage.objects;
DROP POLICY IF EXISTS "Owners can delete property images" ON storage.objects;

-- Allow property owners to upload property images (fixed: use storage object's name, not property name)
CREATE POLICY "Owners can upload property images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'property-images' AND
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id::text = (storage.foldername(objects.name))[1]
    AND pr.id = auth.uid()
  )
);

-- Allow property owners to update their property images
CREATE POLICY "Owners can update property images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'property-images' AND
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id::text = (storage.foldername(objects.name))[1]
    AND pr.id = auth.uid()
  )
);

-- Allow property owners to delete their property images
CREATE POLICY "Owners can delete property images"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'property-images' AND
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id::text = (storage.foldername(objects.name))[1]
    AND pr.id = auth.uid()
  )
);