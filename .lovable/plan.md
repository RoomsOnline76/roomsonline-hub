

# Fix: Specials Not Returning from Portfolio API

## Root Cause
The edge function source code includes the specials query, but the **deployed version** appears to be stale — it returns `specials: []` despite the database containing an active, public "Pensioners Special" for Dassiesingel (which is a confirmed member of the jongensfontein portfolio).

The data is verified correct:
- Dassiesingel (`a22384f0-...`) is a member of the jongensfontein portfolio
- `property_specials` has one row: "Pensioners Special", `is_active=true`, `is_public=true`, `valid_to=2026-12-10`

## Fix
1. **Redeploy** the `booking-portfolio-api` edge function so the specials query code goes live
2. **Add a console.log** for specials query results temporarily to verify the query executes and returns data
3. **Test** the endpoint to confirm specials appear in the response

## Defensive improvement
Add a client-side fallback in `EmbedPortfolio.tsx`: if the API returns no `specials` array (or empty), fetch directly from the database using the property IDs already loaded. This prevents future deploy-lag issues.

## Files to Change

| File | Changes |
|------|---------|
| `supabase/functions/booking-portfolio-api/index.ts` | Add debug logging for specials query result; ensure function is redeployed |
| `src/pages/EmbedPortfolio.tsx` | Add client-side fallback fetch from `property_specials` when API returns empty specials |

