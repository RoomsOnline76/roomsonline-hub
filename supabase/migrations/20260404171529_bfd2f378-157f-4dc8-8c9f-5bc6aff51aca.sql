
-- === Experience Vouchers: restrict INSERT/UPDATE to service_role ===
DROP POLICY IF EXISTS "System can create vouchers" ON public.experience_vouchers;
DROP POLICY IF EXISTS "System can update vouchers" ON public.experience_vouchers;

CREATE POLICY "Service role can create vouchers"
  ON public.experience_vouchers FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "Service role can update vouchers"
  ON public.experience_vouchers FOR UPDATE
  TO service_role USING (true);

-- === Contracts storage bucket ===
DROP POLICY IF EXISTS "Service role can manage contracts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage contracts" ON storage.objects;

CREATE POLICY "Service role can manage contracts"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'contracts')
  WITH CHECK (bucket_id = 'contracts');

CREATE POLICY "Admins can manage contracts"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'contracts'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'dev')
      OR public.has_role(auth.uid(), 'fearless_leader')
    )
  )
  WITH CHECK (
    bucket_id = 'contracts'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'dev')
      OR public.has_role(auth.uid(), 'fearless_leader')
    )
  );

-- === Signatures storage bucket ===
DROP POLICY IF EXISTS "Service role can manage signatures" ON storage.objects;
DROP POLICY IF EXISTS "Admins can manage signatures" ON storage.objects;

CREATE POLICY "Service role can manage signatures"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'signatures')
  WITH CHECK (bucket_id = 'signatures');

CREATE POLICY "Admins can manage signatures"
  ON storage.objects FOR ALL
  TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'dev')
      OR public.has_role(auth.uid(), 'fearless_leader')
    )
  )
  WITH CHECK (
    bucket_id = 'signatures'
    AND (
      public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'dev')
      OR public.has_role(auth.uid(), 'fearless_leader')
    )
  );
