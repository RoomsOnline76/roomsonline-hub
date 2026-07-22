-- ============================================================
-- Verification request tracking for ID uploads
-- ============================================================
CREATE TABLE public.verification_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  booking_reference text,
  storage_path text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'verified', 'rejected', 'expired')),
  min_age integer,
  max_age integer,
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + interval '30 minutes'),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.verification_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.verification_requests TO service_role;

ALTER TABLE public.verification_requests ENABLE ROW LEVEL SECURITY;

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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_verification_requests_updated_at
BEFORE UPDATE ON public.verification_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Secure id-verifications storage bucket
-- ============================================================
DROP POLICY IF EXISTS "Anyone can upload ID verifications" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload their own ID verifications" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read their own ID verifications" ON storage.objects;
DROP POLICY IF EXISTS "Service role can manage ID verifications" ON storage.objects;

CREATE POLICY "Authenticated users can upload their own ID verifications"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'id-verifications'
  AND EXISTS (
    SELECT 1 FROM public.verification_requests
    WHERE storage_path = storage.objects.name
      AND created_by = auth.uid()
      AND status = 'pending'
      AND expires_at > now()
  )
);

CREATE POLICY "Authenticated users can read their own ID verifications"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'id-verifications'
  AND EXISTS (
    SELECT 1 FROM public.verification_requests
    WHERE storage_path = storage.objects.name
      AND created_by = auth.uid()
  )
);

CREATE POLICY "Service role can manage ID verifications"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'id-verifications')
WITH CHECK (bucket_id = 'id-verifications');