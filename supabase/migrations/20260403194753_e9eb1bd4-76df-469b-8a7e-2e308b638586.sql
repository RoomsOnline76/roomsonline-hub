-- Fix property_portfolios: allow SELECT if user owns any member property
DROP POLICY IF EXISTS "Owners can view their portfolios" ON public.property_portfolios;
CREATE POLICY "Owners can view their portfolios" ON public.property_portfolios
FOR SELECT TO authenticated
USING (
  owner_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.property_portfolio_members ppm
    WHERE ppm.portfolio_id = property_portfolios.id
      AND (
        public.is_property_owner(ppm.property_id, auth.uid())
        OR public.is_linked_owner(ppm.property_id, auth.uid())
      )
  )
);

-- Fix property_portfolio_members: allow SELECT if user owns any property in the same portfolio
DROP POLICY IF EXISTS "Owners can view their portfolio members" ON public.property_portfolio_members;
CREATE POLICY "Owners can view their portfolio members" ON public.property_portfolio_members
FOR SELECT TO authenticated
USING (
  public.is_property_owner(property_id, auth.uid())
  OR public.is_linked_owner(property_id, auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.property_portfolio_members sibling
    WHERE sibling.portfolio_id = property_portfolio_members.portfolio_id
      AND (
        public.is_property_owner(sibling.property_id, auth.uid())
        OR public.is_linked_owner(sibling.property_id, auth.uid())
      )
  )
);