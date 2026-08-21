-- Consolidated access helper for the shared image library
CREATE OR REPLACE FUNCTION public.can_write_property_image(_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'dev'::app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::app_role)
    OR public.manages_any_property(auth.uid())
    OR (
      (storage.foldername(_name))[1] = 'reports'
      AND public.has_reports_access(auth.uid())
    )
    OR (
      _name LIKE ('avatars/' || auth.uid()::text || '%')
    )
    OR EXISTS (
      SELECT 1
      FROM public.properties p
      JOIN public.profiles pr ON pr.email = p.owner_email
      WHERE pr.id = auth.uid()
        AND p.id::text = (storage.foldername(_name))[1]
    )
$$;

REVOKE ALL ON FUNCTION public.can_write_property_image(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_property_image(text) TO authenticated;

DROP POLICY IF EXISTS "Admins and devs can upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Admins and devs can update property images" ON storage.objects;
DROP POLICY IF EXISTS "Admins and devs can delete property images" ON storage.objects;
DROP POLICY IF EXISTS "Owners can upload property images" ON storage.objects;
DROP POLICY IF EXISTS "Property managers can upload images" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
DROP POLICY IF EXISTS "Report users can upload report assets" ON storage.objects;
DROP POLICY IF EXISTS "Report users can update report assets" ON storage.objects;
DROP POLICY IF EXISTS "Report users can delete report assets" ON storage.objects;
DROP POLICY IF EXISTS "Image library read" ON storage.objects;
DROP POLICY IF EXISTS "Image library insert" ON storage.objects;
DROP POLICY IF EXISTS "Image library update" ON storage.objects;
DROP POLICY IF EXISTS "Image library delete" ON storage.objects;

CREATE POLICY "Image library read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id IN ('property-images', 'addon-images', 'package-images', 'hero-videos'));

CREATE POLICY "Image library insert"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id IN ('property-images', 'addon-images', 'package-images', 'hero-videos')
  AND public.can_write_property_image(name)
);

CREATE POLICY "Image library update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id IN ('property-images', 'addon-images', 'package-images', 'hero-videos')
  AND public.can_write_property_image(name)
)
WITH CHECK (
  bucket_id IN ('property-images', 'addon-images', 'package-images', 'hero-videos')
  AND public.can_write_property_image(name)
);

CREATE POLICY "Image library delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id IN ('property-images', 'addon-images', 'package-images', 'hero-videos')
  AND public.can_write_property_image(name)
);