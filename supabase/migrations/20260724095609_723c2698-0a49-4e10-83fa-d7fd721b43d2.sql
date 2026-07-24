-- Grant read access to anonymous visitors for the public /connect/pricing page
GRANT SELECT ON public.billing_global_defaults TO anon;

CREATE POLICY "Public can view billing defaults for pricing page"
ON public.billing_global_defaults
FOR SELECT
TO anon
USING (true);