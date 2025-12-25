-- Create storage bucket for hero videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('hero-videos', 'hero-videos', true);

-- Allow anyone to view hero videos
CREATE POLICY "Anyone can view hero videos"
ON storage.objects FOR SELECT
USING (bucket_id = 'hero-videos');

-- Allow admins and devs to upload hero videos
CREATE POLICY "Admins and devs can upload hero videos"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'hero-videos' 
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) 
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  )
);

-- Allow admins and devs to update hero videos
CREATE POLICY "Admins and devs can update hero videos"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'hero-videos' 
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) 
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  )
);

-- Allow admins and devs to delete hero videos
CREATE POLICY "Admins and devs can delete hero videos"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'hero-videos' 
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role) 
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
  )
);