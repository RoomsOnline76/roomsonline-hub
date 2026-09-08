# Cancellation policy per stay shape (LOS / Full Stay)

Let each LOS rung and each Full Stay (FSP) nights-band carry its own cancellation policy, on top of today's plan-level policy and property master.

## How it works today (confirmed)

- Named policies live in `rolos_reservation_policies`; one is flagged master (`MasterPolicyPanel` / `PolicyLibraryTable`).
- A rate plan links a policy via `rolos_policy_rate_links` (dropdown in `RatePlanEditor.tsx`); "none" inherits the master.
- Checkout resolves in order: special policy → plan policy → master (`useResolvedCancellationPolicy.ts`). Server-side entitlement uses `_shared/refundEntitlement.ts`.
- LOS rungs (`rolos_rate_plan_los_rungs`) and FSP cells (`rolos_rate_plan_fsp_cells`) have no policy column, so all stay shapes on a plan share the plan's policy.

## Changes

1. **Schema (migration)**
   - Add nullable `policy_id uuid references rolos_reservation_policies(id)` to `rolos_rate_plan_los_rungs` and `rolos_rate_plan_fsp_cells`. NULL = inherit plan → master (unchanged behaviour).
   - No new tables, no RLS changes (columns on existing policy-protected tables).

2. **Rate Plan editor**
   - LOS ladder: a policy picker per rung ("Inherit plan policy" default) in `RatePlanStayShapeSection.tsx`.
   - FSP matrix: a policy picker per nights-band; the choice is written to all cells of that band on save.
   - `RatePlanEditor.tsx` load/save extended to read/write `policy_id` with the existing ladder/cell payloads (read failure stays silent, per current convention).

3. **Resolution order** (both client and server)
   - New order: special policy → **stay-shape policy (matched rung/band for the quoted nights)** → plan policy → master → legacy.
   - Client: extend `useResolvedCancellationPolicy` to accept the matched shape policy id.
   - Server: `rateResolution.ts` / `refundEntitlement.ts` resolve the same way so quotes, modifications and refunds agree (quote_stay already knows the matched rung/cell — it returns the policy id + name alongside pricing).

4. **Channels**
   - Channel Manager receives the **plan-level** policy as today (it has no per-stay-shape policy concept); shape-specific policies apply to direct/ROL'OS bookings. The editor notes this next to the picker.

5. **Tests**
   - Engine tests: shape policy wins over plan; NULL rung falls back to plan → master.
   - Editor tests: picker round-trips through save/load.

## Out of scope

- Pushing shape-specific policies to the Channel Manager portal (not supported there).
- Changing how the master policy itself is authored.

## Technical notes

- Files: `supabase/functions/_shared/rateResolution.ts`, `refundEntitlement.ts`, `src/hooks/useResolvedCancellationPolicy.ts`, `src/components/pms/rateplans/RatePlanStayShapeSection.tsx`, `RatePlanEditor.tsx`, `useStayShapeBySeason.ts`.
- Conventions: snake_case on the wire, strict TS, ladder read failures never toast.
