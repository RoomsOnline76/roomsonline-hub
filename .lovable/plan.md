
# Fix portfolio detection for Julius across ROL'OS PMS pages

## What is actually wrong
I checked the code and data:

- Dassiesingel is correctly linked to the `jongensfontein` portfolio.
- That portfolio has 4 active properties: Dassiesingel, Seesig, Tidal Pools, Fonteinhutte.
- Julius owns the properties via `properties.owner_email = julius@polka.co.za`.
- But the portfolio record has `owner_id = null`.

So the portfolio toggle is not showing because `usePmsPropertyId()` asks the backend for `property_portfolio_members`, and current access rules only allow:
- admin/dev users, or
- the explicit `property_portfolios.owner_id`

Julius is neither of those for the portfolio record, so the hook cannot read the portfolio membership rows. As a result:
- Dashboard toggle stays hidden
- Integrations toggle stays hidden
- Branding cannot recognize the portfolio
- Branding also currently has no portfolio toggle UI implemented at all

## Implementation plan

### 1. Fix backend access rules for portfolios
Update portfolio access so a user can read a portfolio and its members when they own any property inside that portfolio, including linked owners.

Add/adjust policies so authenticated users can `SELECT`:
- `property_portfolios` if they own at least one member property
- `property_portfolio_members` if they own the member property, or any property inside that portfolio

Use the existing helper patterns:
- `is_property_owner(property_id, auth.uid())`
- `is_linked_owner(property_id, auth.uid())`

This is the core fix that will unblock all PMS pages.

### 2. Strengthen `usePmsPropertyId`
Keep the current shared-selection approach, but make the hook more resilient:
- include hook loading from auth readiness, not only property query loading
- ensure portfolio membership fetch waits for a resolved usable `propertyId`
- keep returning all active portfolio members once membership is visible

This avoids false “no portfolio” states during initial load.

### 3. Make Dashboard toggle reliably appear
`PMSDashboard.tsx` already has the toggle UI.
After the backend policy fix, it should appear automatically for Julius when a Jongensfontein property is selected.

I would still tighten the render logic slightly:
- derive `showPortfolioToggle` from loaded portfolio context
- optionally reset invalid `dashboardView="portfolio"` when portfolio size drops below 2

### 4. Make Integrations toggle reliably appear
`PMSIntegrations.tsx` already has the toggle UI as well.
After the same hook fix, the toggle should become visible.

I would also align it with Dashboard behavior:
- use the same “portfolio context loaded + more than 1 member” rule
- avoid brief hidden/visible flicker during load

### 5. Add missing Portfolio toggle to Branding
`PMSBranding.tsx` currently has no portfolio toggle logic at all.
I would add:
- a `Single / Portfolio` toggle in the page header
- single-property mode = current branding form
- portfolio mode = portfolio branding form using `property_portfolios.metadata.branding`

Portfolio mode should allow editing:
- logo
- primary / secondary / font colors
- optional heading/body fonts if already used elsewhere

This matches the user expectation that Branding should also recognize portfolio context.

### 6. Reuse existing portfolio branding patterns
There is already established portfolio branding storage in admin portfolio management and staff login branding.
So Branding page should reuse that same source of truth:
- read portfolio branding from `property_portfolios.metadata.branding`
- save back to the same structure
- avoid creating new tables or duplicate fields

## Files likely involved
- `src/hooks/usePmsPropertyId.ts`
- `src/pages/pms/PMSDashboard.tsx`
- `src/pages/pms/PMSIntegrations.tsx`
- `src/pages/pms/PMSBranding.tsx`
- new migration updating portfolio read policies:
  - `property_portfolios`
  - `property_portfolio_members`

## Technical details
```text
Current failure path:
Julius selects Dassiesingel
-> usePmsPropertyId(propertyId = Dassiesingel)
-> query property_portfolio_members where property_id = Dassiesingel
-> RLS blocks rows because portfolio.owner_id is null
-> portfolioContext = null
-> portfolioProperties = null
-> toggle condition fails on Dashboard/Integrations
-> Branding has no portfolio UI anyway
```

```text
Desired behavior:
Julius owns Dassiesingel / Seesig / Tidal / Fonteinhutte
-> backend allows reading their portfolio memberships
-> usePmsPropertyId returns all Jongensfontein portfolio properties
-> Dashboard toggle shows
-> Integrations toggle shows
-> Branding also offers Single / Portfolio switch
```

## Expected result
When Julius is logged in and selects any Jongensfontein property:
- Dashboard shows the Single / Portfolio toggle
- Integrations shows the Single / Portfolio toggle
- Branding recognizes the portfolio and shows a Single / Portfolio switch
- all 4 Jongensfontein properties are used as the portfolio context
