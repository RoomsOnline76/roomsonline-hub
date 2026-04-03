
# Fix portfolio detection across Dashboard, Branding, Staff URLs, and Integrations

## What is actually broken
The shared PMS portfolio hook is still failing for owner users like Julius, so all pages that depend on it think there is no portfolio.

The likely root cause is the last backend policy change:
- `property_portfolio_members` now has a `SELECT` policy that queries `property_portfolio_members` again inside the policy itself.
- That is the exact self-referential RLS pattern that can fail with recursive policy evaluation.
- In `usePmsPropertyId()`, all portfolio queries ignore errors, so a backend failure is silently treated as “no memberships”.
- The pages then hide:
  - Dashboard toggle
  - Integrations toggle
  - Branding portfolio switch / extra review IDs
  - Staff portfolio + per-property login URLs

The Portfolio page can still appear “correct” because it has its own portfolio fetch path (`PortfolioManager` / direct portfolio queries), so it is not a reliable proof that the shared hook is healthy.

## Implementation plan

### 1. Replace the broken recursive portfolio-member RLS rule
Create a new security-definer helper function, for example:

```text
public.user_can_access_portfolio(_portfolio_id uuid, _user_id uuid)
```

It should:
- look up member properties inside the portfolio
- return true if the user is a primary owner or linked owner of any member property

Then update policies:

- `property_portfolios` SELECT:
  - allow if `owner_id = auth.uid()`
  - or `user_can_access_portfolio(id, auth.uid())`

- `property_portfolio_members` SELECT:
  - allow if `is_property_owner(property_id, auth.uid())`
  - or `is_linked_owner(property_id, auth.uid())`
  - or `user_can_access_portfolio(portfolio_id, auth.uid())`

This removes the self-query from the policy and makes owner access safe and deterministic.

### 2. Harden `usePmsPropertyId()`
Update the hook so it no longer silently collapses to “no portfolio”:

- include `user?.id` and auth loading state in the portfolio query key / enable condition
- wait for auth readiness before fetching portfolio membership
- capture query errors from:
  - membership lookup
  - sibling member lookup
  - member property lookup
- expose clearer state such as:
  - `portfolioLoading`
  - `hasPortfolio`
  - `showPortfolioToggle`

Also return hook loading as:
```text
auth loading OR property loading OR portfolio loading
```

### 3. Use the hook’s resolved portfolio state consistently
Update PMS pages to rely on the new hook booleans instead of recomputing from a maybe-null array during load.

Target pages:
- `src/pages/pms/PMSDashboard.tsx`
- `src/pages/pms/PMSIntegrations.tsx`
- `src/pages/pms/PMSBranding.tsx`
- `src/pages/pms/PMSStaff.tsx`

Behavior:
- while portfolio context is resolving, do not render a false “single-only” state
- once resolved, show portfolio UI immediately if the property belongs to a multi-property portfolio

### 4. Keep existing UI, only unblock it
These pieces mostly already exist:
- Dashboard toggle already exists
- Integrations toggle already exists
- Branding portfolio switch already exists
- Staff portfolio + per-property login URLs already exist
- Branding portfolio review-platform cards already exist

So this is mainly a shared data-access + loading-state repair, not a rebuild.

## Files to change
- `supabase/migrations/...`  
  Add security-definer helper function and replace the recursive `SELECT` policy logic
- `src/hooks/usePmsPropertyId.ts`  
  Add auth-aware loading, non-silent error handling, and explicit portfolio state
- `src/pages/pms/PMSDashboard.tsx`  
  Use resolved hook state for toggle visibility
- `src/pages/pms/PMSIntegrations.tsx`  
  Use resolved hook state for toggle visibility
- `src/pages/pms/PMSBranding.tsx`  
  Use resolved hook state for portfolio switch / review IDs
- `src/pages/pms/PMSStaff.tsx`  
  Use resolved hook state for portfolio URL + per-property URLs

## Expected result
When Julius selects Dassiesingel, Seesig, Tidal Pools, or Fonteinhutte:

- Dashboard shows the Single / Portfolio toggle
- Integrations shows the Property / Portfolio toggle
- Branding shows the Single / Portfolio switch
- Branding portfolio mode shows the extra review-platform ID cards per property
- Staff Management shows:
  - the portfolio login URL
  - one staff login URL for each property in the portfolio

## Technical details
```text
Current failure path
selected property -> usePmsPropertyId()
-> property_portfolio_members SELECT hits recursive/self-referential policy
-> query errors or returns no usable rows
-> hook suppresses error
-> portfolioProperties = null
-> all PMS pages conclude "not in a portfolio"
```

```text
Fixed path
selected property -> usePmsPropertyId()
-> non-recursive security-definer portfolio access check succeeds
-> hook resolves member properties and loading state correctly
-> pages receive hasPortfolio/showPortfolioToggle = true
-> toggles and portfolio-specific UI appear everywhere consistently
```
