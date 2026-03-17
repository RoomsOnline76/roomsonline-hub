
-- Drop existing restrictive anon policies on rolos_rate_plans
DROP POLICY IF EXISTS "Public can read active rate plans for listed properties" ON public.rolos_rate_plans;

-- Create broader policy: anon can read active rate plans for any active property
CREATE POLICY "Anon can read active rate plans"
ON public.rolos_rate_plans FOR SELECT TO anon
USING (is_active = true AND EXISTS (
  SELECT 1 FROM properties p WHERE p.id = property_id AND p.is_active = true
));

-- Drop existing restrictive anon policies on rolos_rate_plan_room_types
DROP POLICY IF EXISTS "Public can read rate plan room types for listed properties" ON public.rolos_rate_plan_room_types;

-- Create broader policy: anon can read rate plan room types for any active property
CREATE POLICY "Anon can read rate plan room types"
ON public.rolos_rate_plan_room_types FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM rolos_rate_plans rp
  JOIN properties p ON p.id = rp.property_id
  WHERE rp.id = rate_plan_id AND rp.is_active = true AND p.is_active = true
));
