DROP POLICY IF EXISTS "Authorised users can read portfolio logos" ON storage.objects;

CREATE POLICY "Authorised users can read portfolio logos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'portfolio-logos'
  AND (
    public.has_role(auth.uid(), 'user'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'dev'::public.app_role)
    OR public.has_role(auth.uid(), 'fearless_leader'::public.app_role)
  )
);