
-- Helper: does this user manage any property (owner, linked owner or staff)?
CREATE OR REPLACE FUNCTION public.manages_any_property(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.property_owners po WHERE po.user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.property_staff ps WHERE ps.user_id = _user_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.manages_any_property(uuid) TO authenticated;

-- Uploads
DROP POLICY IF EXISTS "Property managers can upload images" ON storage.objects;
CREATE POLICY "Property managers can upload images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('property-images','addon-images','package-images')
  AND public.manages_any_property(auth.uid())
);

-- Replace own uploads
DROP POLICY IF EXISTS "Property managers can update own images" ON storage.objects;
CREATE POLICY "Property managers can update own images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('property-images','addon-images','package-images')
  AND owner = auth.uid()
  AND public.manages_any_property(auth.uid())
)
WITH CHECK (
  bucket_id IN ('property-images','addon-images','package-images')
  AND owner = auth.uid()
  AND public.manages_any_property(auth.uid())
);

-- Remove own uploads
DROP POLICY IF EXISTS "Property managers can delete own images" ON storage.objects;
CREATE POLICY "Property managers can delete own images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('property-images','addon-images','package-images')
  AND owner = auth.uid()
  AND public.manages_any_property(auth.uid())
);
