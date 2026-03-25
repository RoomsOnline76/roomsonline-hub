
CREATE POLICY "Owners can manage their promo codes"
ON public.promo_codes FOR ALL TO authenticated
USING (
  property_id IN (
    SELECT id FROM public.properties WHERE owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  OR public.is_linked_owner(property_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
)
WITH CHECK (
  property_id IN (
    SELECT id FROM public.properties WHERE owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
  OR public.is_linked_owner(property_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'dev')
  OR public.has_role(auth.uid(), 'fearless_leader')
);
