-- ============================================================
-- Allow guest uploads to id-verifications via signed URLs
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can upload their own ID verifications" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read their own ID verifications" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage ID verifications" ON storage.objects;

CREATE POLICY "Guests can upload to pending verification request path"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (
  bucket_id = 'id-verifications'
  AND EXISTS (
    SELECT 1 FROM public.verification_requests
    WHERE storage_path = storage.objects.name
      AND status = 'pending'
      AND expires_at > now()
  )
);

CREATE POLICY "Guests can read pending verification uploads"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'id-verifications'
  AND EXISTS (
    SELECT 1 FROM public.verification_requests
    WHERE storage_path = storage.objects.name
      AND status IN ('pending', 'uploaded')
      AND expires_at > now()
  )
);

CREATE POLICY "Service role can manage ID verifications"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'id-verifications')
WITH CHECK (bucket_id = 'id-verifications');

-- Allow service role to create verification requests for anonymous guests
DROP POLICY IF EXISTS "Users can manage their own verification requests" ON public.verification_requests;
DROP POLICY IF EXISTS "Service role can manage all verification requests" ON public.verification_requests;

CREATE POLICY "Users can manage their own verification requests"
ON public.verification_requests
FOR ALL
TO authenticated
USING (created_by = auth.uid())
WITH CHECK (created_by = auth.uid());

CREATE POLICY "Service role can manage all verification requests"
ON public.verification_requests
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);