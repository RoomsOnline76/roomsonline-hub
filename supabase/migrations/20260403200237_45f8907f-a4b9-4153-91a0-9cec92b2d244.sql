
-- Step 1: Create a SECURITY DEFINER helper to check portfolio access without RLS recursion
CREATE OR REPLACE FUNCTION public.user_can_access_portfolio(_portfolio_id uuid, _user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM property_portfolio_members ppm
    JOIN properties p ON ppm.property_id = p.id
    JOIN profiles pr ON p.owner_email = pr.email
    WHERE ppm.portfolio_id = _portfolio_id
      AND (
        pr.id = _user_id
        OR EXISTS (
          SELECT 1 FROM property_owners po
          WHERE po.property_id = ppm.property_id AND po.user_id = _user_id
        )
      )
  );
$$;

-- Restrict to authenticated users only
REVOKE EXECUTE ON FUNCTION public.user_can_access_portfolio FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_can_access_portfolio TO authenticated;

-- Step 2: Replace property_portfolios SELECT policy
DROP POLICY IF EXISTS "Owners can view their portfolios" ON public.property_portfolios;
DROP POLICY IF EXISTS "Users can view portfolios they own or have access to" ON public.property_portfolios;

CREATE POLICY "Users can view portfolios they own or have access to"
ON public.property_portfolios FOR SELECT
TO authenticated
USING (
  owner_id = auth.uid()
  OR public.user_can_access_portfolio(id, auth.uid())
);

-- Step 3: Replace property_portfolio_members SELECT policy (non-recursive)
DROP POLICY IF EXISTS "Owners can view their portfolio members" ON public.property_portfolio_members;
DROP POLICY IF EXISTS "Users can view members of portfolios they have access to" ON public.property_portfolio_members;

CREATE POLICY "Users can view members of portfolios they have access to"
ON public.property_portfolio_members FOR SELECT
TO authenticated
USING (
  public.is_property_owner(property_id, auth.uid())
  OR public.is_linked_owner(property_id, auth.uid())
  OR public.user_can_access_portfolio(portfolio_id, auth.uid())
);
