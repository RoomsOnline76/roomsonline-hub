-- Create portfolio-logos storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('portfolio-logos', 'portfolio-logos', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload portfolio logos
CREATE POLICY "Authenticated users can upload portfolio logos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'portfolio-logos');

-- Allow public read access to portfolio logos
CREATE POLICY "Public read access for portfolio logos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'portfolio-logos');

-- Allow authenticated users to update/delete their uploads
CREATE POLICY "Authenticated users can manage portfolio logos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'portfolio-logos');