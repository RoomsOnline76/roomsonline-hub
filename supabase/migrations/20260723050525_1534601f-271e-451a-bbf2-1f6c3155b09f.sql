
-- 1. billing_global_defaults: remove broad authenticated SELECT policy
DROP POLICY IF EXISTS "Authenticated users can read billing defaults" ON public.billing_global_defaults;
CREATE POLICY "Admins and devs can view billing defaults"
  ON public.billing_global_defaults FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

-- 2. billing_mappings: remove broad authenticated SELECT policy
DROP POLICY IF EXISTS "Authenticated users can view billing mappings" ON public.billing_mappings;
CREATE POLICY "Admins and devs can view billing mappings"
  ON public.billing_mappings FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

-- 3. experience_vouchers: remove public enumeration policy. Client lookups go via edge function using service role.
DROP POLICY IF EXISTS "Vouchers can be read by code lookup" ON public.experience_vouchers;
CREATE POLICY "Admins can view vouchers"
  ON public.experience_vouchers FOR SELECT TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'dev'::app_role) OR has_role(auth.uid(),'fearless_leader'::app_role));

-- 4. Public bucket listing: restrict SELECT (list) on public buckets to authenticated only.
-- Public file URLs continue to work (public buckets serve files without RLS); only enumeration via .list() is gated.
DROP POLICY IF EXISTS "Anyone can view hero videos" ON storage.objects;
CREATE POLICY "Authenticated can list hero videos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='hero-videos');

DROP POLICY IF EXISTS "Anyone can view package images" ON storage.objects;
CREATE POLICY "Authenticated can list package images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='package-images');

DROP POLICY IF EXISTS "Anyone can view property images" ON storage.objects;
CREATE POLICY "Authenticated can list property images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='property-images');

DROP POLICY IF EXISTS "Anyone can view template images" ON storage.objects;
CREATE POLICY "Authenticated can list template images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='template-images');

DROP POLICY IF EXISTS "Addon images are publicly accessible" ON storage.objects;
CREATE POLICY "Authenticated can list addon images" ON storage.objects FOR SELECT TO authenticated USING (bucket_id='addon-images');

-- 5. SECURITY DEFINER functions: revoke EXECUTE from PUBLIC and anon.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
END $$;
