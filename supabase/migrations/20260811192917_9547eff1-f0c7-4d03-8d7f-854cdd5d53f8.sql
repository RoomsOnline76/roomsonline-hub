CREATE OR REPLACE FUNCTION public.scoped_admin_can_access_portfolio(_user_id uuid, _portfolio_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (NOT public.is_scoped_admin(_user_id))
    OR EXISTS (
      SELECT 1
      FROM public.property_portfolio_members m
      JOIN public.scoped_admin_properties s ON s.property_id = m.property_id
      WHERE m.portfolio_id = _portfolio_id
        AND s.user_id = _user_id
    );
$$;

DROP POLICY IF EXISTS "Admins and devs can manage all portfolios" ON public.property_portfolios;

CREATE POLICY "Admins and devs can manage all portfolios"
ON public.property_portfolios
FOR ALL
USING (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
  AND public.scoped_admin_can_access_portfolio(auth.uid(), id)
)
WITH CHECK (
  (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'dev'::app_role))
  AND (NOT public.is_scoped_admin(auth.uid()))
);