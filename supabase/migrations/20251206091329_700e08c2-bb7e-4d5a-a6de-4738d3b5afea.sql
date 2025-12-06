-- Drop existing avatar upload policy if it exists
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;

-- Create updated policy that allows all authenticated users (including dev role) to upload avatars
CREATE POLICY "Users can upload their own avatar" 
ON storage.objects 
FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'property-images' 
  AND (storage.foldername(name))[1] = 'avatars'
  AND auth.uid()::text = split_part((storage.foldername(name))[2], '-', 1) || '-' || split_part((storage.foldername(name))[2], '-', 2) || '-' || split_part((storage.foldername(name))[2], '-', 3) || '-' || split_part((storage.foldername(name))[2], '-', 4) || '-' || split_part((storage.foldername(name))[2], '-', 5)
);

-- Also ensure update policy exists for avatars
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;

CREATE POLICY "Users can update their own avatar" 
ON storage.objects 
FOR UPDATE 
TO authenticated
USING (
  bucket_id = 'property-images' 
  AND (storage.foldername(name))[1] = 'avatars'
);