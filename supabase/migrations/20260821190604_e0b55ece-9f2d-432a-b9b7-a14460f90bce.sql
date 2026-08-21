DROP POLICY IF EXISTS "Report users can upload report assets" ON storage.objects;
DROP POLICY IF EXISTS "Report users can update report assets" ON storage.objects;
DROP POLICY IF EXISTS "Report users can delete report assets" ON storage.objects;

CREATE POLICY "Report users can upload report assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-images'
  AND (storage.foldername(name))[1] = 'reports'
  AND public.has_reports_access(auth.uid())
);

CREATE POLICY "Report users can update report assets"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-images'
  AND (storage.foldername(name))[1] = 'reports'
  AND public.has_reports_access(auth.uid())
)
WITH CHECK (
  bucket_id = 'property-images'
  AND (storage.foldername(name))[1] = 'reports'
  AND public.has_reports_access(auth.uid())
);

CREATE POLICY "Report users can delete report assets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-images'
  AND (storage.foldername(name))[1] = 'reports'
  AND public.has_reports_access(auth.uid())
);