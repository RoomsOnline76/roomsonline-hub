-- Allow property owners to upload hero videos
CREATE POLICY "Owners can upload hero videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'hero-videos' AND
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id::text = (storage.foldername(objects.name))[1]
    AND pr.id = auth.uid()
  )
);

-- Allow property owners to update their hero videos
CREATE POLICY "Owners can update hero videos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'hero-videos' AND
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id::text = (storage.foldername(objects.name))[1]
    AND pr.id = auth.uid()
  )
);

-- Allow property owners to delete their hero videos
CREATE POLICY "Owners can delete hero videos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'hero-videos' AND
  EXISTS (
    SELECT 1 FROM properties p
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE p.id::text = (storage.foldername(objects.name))[1]
    AND pr.id = auth.uid()
  )
);