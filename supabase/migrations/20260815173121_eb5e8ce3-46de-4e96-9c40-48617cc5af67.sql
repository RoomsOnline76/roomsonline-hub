GRANT SELECT ON storage.objects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
GRANT ALL ON storage.objects TO service_role;

DROP POLICY IF EXISTS "Signed in users can upload shared images" ON storage.objects;
DROP POLICY IF EXISTS "Signed in users can update shared images" ON storage.objects;

CREATE POLICY "Authorised users can upload shared images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = ANY (ARRAY['addon-images','package-images','template-images','portfolio-logos'])
  AND (
    public.has_role(auth.uid(), 'user'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
  )
);

CREATE POLICY "Authorised users can update shared images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['addon-images','package-images','template-images','portfolio-logos'])
  AND (
    owner = auth.uid()
    OR owner_id = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = ANY (ARRAY['addon-images','package-images','template-images','portfolio-logos'])
  AND (
    owner = auth.uid()
    OR owner_id = auth.uid()::text
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
  )
);