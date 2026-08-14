-- Scoped admins can read portfolios they belong to, but UPDATE was blocked
-- by WITH CHECK (NOT is_scoped_admin). Turning Portfolio Commons auto-share
-- off (or on) writes metadata.commons.auto_share and failed with an RLS error.
-- Keep INSERT/DELETE restricted; allow UPDATE on portfolios they can access.

DROP POLICY IF EXISTS "Admins and devs can manage all portfolios" ON public.property_portfolios;

CREATE POLICY "Admins and devs can select portfolios"
ON public.property_portfolios
FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role))
  AND public.scoped_admin_can_access_portfolio(auth.uid(), id)
);

CREATE POLICY "Admins and devs can update accessible portfolios"
ON public.property_portfolios
FOR UPDATE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role))
  AND public.scoped_admin_can_access_portfolio(auth.uid(), id)
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role))
  AND public.scoped_admin_can_access_portfolio(auth.uid(), id)
);

CREATE POLICY "Admins and devs can insert portfolios"
ON public.property_portfolios
FOR INSERT
TO authenticated
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role))
  AND NOT public.is_scoped_admin(auth.uid())
);

CREATE POLICY "Admins and devs can delete portfolios"
ON public.property_portfolios
FOR DELETE
TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'dev'::app_role))
  AND NOT public.is_scoped_admin(auth.uid())
);
