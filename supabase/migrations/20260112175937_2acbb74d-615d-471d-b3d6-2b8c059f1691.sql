-- Create property-documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('property-documents', 'property-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Policy: Authenticated users can upload documents
CREATE POLICY "Authenticated users can upload property documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'property-documents');

-- Policy: Authenticated users can view documents
CREATE POLICY "Authenticated users can view property documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'property-documents');

-- Policy: Authenticated users can delete documents
CREATE POLICY "Authenticated users can delete property documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'property-documents');

-- Policy: Authenticated users can update documents
CREATE POLICY "Authenticated users can update property documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'property-documents');