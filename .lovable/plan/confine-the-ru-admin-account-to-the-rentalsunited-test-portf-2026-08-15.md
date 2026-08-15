# Confine the ru-admin account to the RentalsUnited TEST portfolio

## Current state (verified)

- `ru-admin@roomsonline.co.za` is scoped to exactly two properties: **Seesig Self Catering Chalets** and **Tidal Pools Self Catering Apartments** (the live Jongensfontein listings).
- Those two ids are also hardcoded in the app (`src/lib/adminScope.ts`) and re-applied as a client-side fallback, so the account is pinned to the live listings even if the database scope changes.
- The **RentalsUnited TEST** portfolio exists and holds four properties: Dassiesingel (Copy), Fonteinhutte (Copy), Seesig (Copy), Tidal Pools (Copy) — all active, none trading, channel push off.

So today the tester account can see live trading properties and cannot see the TEST clones at all.

## What to change

1. **Repoint the account scope** to the four members of the RentalsUnited TEST portfolio, and remove the two live-property rows.
2. **Make the pin portfolio-driven instead of id-driven.** The hardcoded Seesig/Tidal ids and the `name ILIKE '%seesig%'`/`'%tidal%'` matching are replaced by "every member of the RentalsUnited TEST portfolio", so adding or removing a clone from that portfolio automatically changes what the tester sees — no code or data edit needed.
3. **Keep the safety net honest.** The app-side fallback stops asserting a fixed pair of ids; it simply trusts the resolved scope from the database, so a tester can never fall back onto live properties.
4. **Portfolio pickers** shown inside the routes a scoped admin may reach are narrowed to portfolios that contain at least one in-scope property, so the tester sees only "RentalsUnited TEST" rather than all four portfolios.

Nothing changes for unrestricted admin, dev or fearless_leader accounts.

## Technical detail

- Migration: rewrite `public.scoped_admin_properties` rows for the tester user as a select over `property_portfolio_members` joined to the portfolio named `RentalsUnited TEST`, then delete any of that user's rows not in that set. Database-side authorisation (`admin_scope_allows`) already reads this table, so RLS follows automatically.
- `src/lib/adminScope.ts`: drop `IT_TEST_PROPERTY_IDS` and the name-based `isItTestProperty` heuristic; keep the tester email constant only where a UI label needs it. `resolveScopedPropertyIds` returns the database rows verbatim.
- Update the call sites that used the removed helpers: `src/hooks/usePmsPropertyId.ts` and `src/pages/AdminOnboarding.tsx` (both currently re-filter to the hardcoded pair after the scoped query, which would hide the TEST clones).
- Add scope filtering to the portfolio selectors reachable by a scoped admin (`usePmsPropertyId` portfolio derivation and the Channel Monitor grouping already receive `scopedPropertyIds`; confirm each drops empty portfolios).
- Verify after the change by signing in as the tester in the preview and checking the admin dashboard, onboarding queue, property list and channel monitor all show only the four TEST clones.
