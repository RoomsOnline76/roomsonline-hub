
-- Drop the problematic policy that references auth.users directly
DROP POLICY IF EXISTS "Owners can manage their promo codes" ON public.promo_codes;

-- Recreate it using auth.email() instead of querying auth.users
CREATE POLICY "Owners can manage their promo codes"
ON public.promo_codes
FOR ALL
TO authenticated
USING (
  (property_id IN (
    SELECT id FROM public.properties WHERE owner_email = auth.email()
  ))
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
)
WITH CHECK (
  (property_id IN (
    SELECT id FROM public.properties WHERE owner_email = auth.email()
  ))
  OR is_linked_owner(property_id, auth.uid())
  OR has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'dev'::app_role)
  OR has_role(auth.uid(), 'fearless_leader'::app_role)
);
