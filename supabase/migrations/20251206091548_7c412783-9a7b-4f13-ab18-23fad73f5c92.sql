-- Drop existing policies
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;

-- Create simpler policy: allow authenticated users to upload avatars that start with their user ID
CREATE POLICY "Users can upload their own avatar" 
ON storage.objects 
FOR INSERT 
TO authenticated
WITH CHECK (
  bucket_id = 'property-images' 
  AND name LIKE 'avatars/%'
  AND name LIKE 'avatars/' || auth.uid()::text || '%'
);

-- Allow users to update their own avatars
CREATE POLICY "Users can update their own avatar" 
ON storage.objects 
FOR UPDATE 
TO authenticated
USING (
  bucket_id = 'property-images' 
  AND name LIKE 'avatars/' || auth.uid()::text || '%'
);