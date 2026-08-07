-- 1. Fix property-documents ownership check: match the OBJECT path, not the property name.
DROP POLICY IF EXISTS "Property owners can view documents" ON storage.objects;
DROP POLICY IF EXISTS "Property owners can update documents" ON storage.objects;
DROP POLICY IF EXISTS "Property owners can upload documents" ON storage.objects;
DROP POLICY IF EXISTS "Property owners can delete documents" ON storage.objects;

CREATE POLICY "Property owners can view documents"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'property-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND (p.owner_email = auth.email() OR public.is_linked_owner(p.id, auth.uid()))
    )
  )
);

CREATE POLICY "Property owners can upload documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'property-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND (p.owner_email = auth.email() OR public.is_linked_owner(p.id, auth.uid()))
    )
  )
);

CREATE POLICY "Property owners can update documents"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'property-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND (p.owner_email = auth.email() OR public.is_linked_owner(p.id, auth.uid()))
    )
  )
);

CREATE POLICY "Property owners can delete documents"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'property-documents'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = (storage.foldername(storage.objects.name))[1]
        AND (p.owner_email = auth.email() OR public.is_linked_owner(p.id, auth.uid()))
    )
  )
);

-- 2. Shared image buckets: uploads stay open to signed-in staff, but overwrite/delete
--    is restricted to the uploader or an admin/dev.
DROP POLICY IF EXISTS "Authenticated users can update addon images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete addon images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update package images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete package images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update template images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete template images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can manage portfolio logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload addon images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload package images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload template images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload portfolio logos" ON storage.objects;

CREATE POLICY "Signed in users can upload shared images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id IN ('addon-images', 'package-images', 'template-images', 'portfolio-logos')
  AND owner = auth.uid()
);

CREATE POLICY "Uploaders and admins can update shared images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id IN ('addon-images', 'package-images', 'template-images', 'portfolio-logos')
  AND (
    owner = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

CREATE POLICY "Uploaders and admins can delete shared images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id IN ('addon-images', 'package-images', 'template-images', 'portfolio-logos')
  AND (
    owner = auth.uid()
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'dev'::app_role)
    OR has_role(auth.uid(), 'fearless_leader'::app_role)
  )
);

-- 3. Privileged routines must not be callable by unauthenticated visitors.
REVOKE ALL ON FUNCTION public.rolos_adjust_booked_inventory(uuid, uuid, date, date, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rolos_apply_block_inventory(uuid, uuid, date, date, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rolos_convert_block_to_booked(uuid, uuid, date, date, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.rolos_hold_block_inventory(uuid, uuid, date, date, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_role_self_escalation() FROM anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rolos_adjust_booked_inventory(uuid, uuid, date, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rolos_apply_block_inventory(uuid, uuid, date, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rolos_convert_block_to_booked(uuid, uuid, date, date, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rolos_hold_block_inventory(uuid, uuid, date, date, integer) TO service_role;