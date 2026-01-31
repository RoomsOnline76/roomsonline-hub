-- Allow property owners to upload property images
CREATE POLICY "Owners can upload property images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'property-images' AND
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id::text = (storage.foldername(name))[1]
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
    WHERE p.id::text = (storage.foldername(name))[1]
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
    WHERE p.id::text = (storage.foldername(name))[1]
    AND pr.id = auth.uid()
  )
);