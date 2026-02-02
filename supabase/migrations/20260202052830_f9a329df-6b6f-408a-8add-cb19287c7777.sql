-- Create documents bucket for brochure storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents', 
  true,
  5242880,
  ARRAY['text/html', 'application/pdf']::text[]
);

-- Add RLS policy for public read access
CREATE POLICY "Public read access for documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');

-- Allow service role to upload
CREATE POLICY "Service role can upload documents"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'documents');