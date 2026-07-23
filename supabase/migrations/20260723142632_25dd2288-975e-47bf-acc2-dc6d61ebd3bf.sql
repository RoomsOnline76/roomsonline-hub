
-- Remove blanket authenticated-read policies on private buckets.
-- App reads these buckets via signed URLs (service_role); admins/devs get an explicit read policy for direct access.

DROP POLICY IF EXISTS "Authenticated users can read contracts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read signatures" ON storage.objects;
DROP POLICY IF EXISTS "invoices_read_authenticated" ON storage.objects;

-- Admin/dev/fearless_leader direct reads (signed URLs still work for everyone via service_role).
CREATE POLICY "Admins can read contracts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'contracts'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  )
);

CREATE POLICY "Admins can read signatures"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'signatures'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  )
);

CREATE POLICY "Admins can read invoices"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'invoices'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'dev')
    OR public.has_role(auth.uid(), 'fearless_leader')
  )
);
