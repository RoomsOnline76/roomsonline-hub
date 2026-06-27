
-- Helper: does the current user own a portfolio that contains this property?
CREATE OR REPLACE FUNCTION public.user_can_access_property_via_portfolio(_property_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.property_portfolio_members ppm
    JOIN public.property_portfolios pp ON pp.id = ppm.portfolio_id
    WHERE ppm.property_id = _property_id
      AND pp.owner_id = auth.uid()
  );
$$;

-- Bookings: portfolio-scoped read access
DROP POLICY IF EXISTS "Portfolio owners can view bookings" ON public.bookings;
CREATE POLICY "Portfolio owners can view bookings"
ON public.bookings
FOR SELECT
TO authenticated
USING (public.user_can_access_property_via_portfolio(property_id));

-- Rolos rooms: portfolio-scoped read access
DROP POLICY IF EXISTS "Portfolio owners can view rooms" ON public.rolos_rooms;
CREATE POLICY "Portfolio owners can view rooms"
ON public.rolos_rooms
FOR SELECT
TO authenticated
USING (public.user_can_access_property_via_portfolio(property_id));

-- Rolos rate plans: portfolio-scoped read access
DROP POLICY IF EXISTS "Portfolio owners can view rate plans" ON public.rolos_rate_plans;
CREATE POLICY "Portfolio owners can view rate plans"
ON public.rolos_rate_plans
FOR SELECT
TO authenticated
USING (public.user_can_access_property_via_portfolio(property_id));
