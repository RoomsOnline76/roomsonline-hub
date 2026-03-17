
-- Allow anonymous read access to rate plan room type mappings (needed for embed page pricing)
CREATE POLICY "Public can read rate plan room type links for active properties"
ON public.rolos_rate_plan_room_types
FOR SELECT
TO anon
USING (
  EXISTS (
    SELECT 1 FROM rolos_rate_plans rp
    JOIN properties p ON p.id = rp.property_id
    WHERE rp.id = rate_plan_id
      AND rp.is_active = true
      AND p.is_active = true
      AND p.show_on_website = true
  )
);

-- Allow anonymous read access to active rate plans for active public properties (needed for embed page pricing)
CREATE POLICY "Public can read active rate plans for listed properties"
ON public.rolos_rate_plans
FOR SELECT
TO anon
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM properties p
    WHERE p.id = property_id
      AND p.is_active = true
      AND p.show_on_website = true
  )
);
