# Fix RU Step 5 availability and duplicate unit links

## Goal

Make White-Label Wizard Step 5 use the same authored availability, Min/Max Stay, and pricing hierarchy that the RU push uses, route blockers to the correct room fields, and stop duplicate unit mirrors from multiplying Rate Plan links.

## Verified current state

- Seesig has an active Rack plan with `min_stay = 1`, a positive base rate, and every active mirrored room row has `min_stay = 1` plus a positive daily fallback rate.
- Its forward `property_availability` table has no rows, but that table represents manual overrides; the RU push builds a complete rolling window from Calendar seasons and fills uncovered dates before applying manual stop-sells.
- Step 5 currently treats an empty live RU read-back as a mandatory failure even when local coverage is complete, producing the reported `0 open day(s)` and missing-MinStay messages.
- The property has 9 authored room types, but 59 active mirrored room-type rows and 47 Rate Plan links. The database has only one Rack Rate Plan; the apparent duplication comes from duplicated unit mirrors/links, not duplicate plan records.
- The Rooms Min/Max Stay inputs save correctly, but they have no readiness field markers, and the Step 5 MinStay fix hint points to Rate Manager rather than the owning Rooms fields.

## Changes

1. **Correct Step 5 readiness authority**
   - Calculate the local rolling 365-day availability per mapped/authored unit using the same normalized Calendar window as the RU push.
   - Treat missing manual availability rows as “no override,” not “closed.”
   - Resolve prices through the established hierarchy: Calendar override/season rate → Rate Plan season/rack rate → unit daily fallback.
   - Resolve Min/Max Stay from unit fields first, then dated restrictions/Rate Plan defaults, matching the outbound payload.
   - When live RU read-back is empty or unavailable but the local payload is complete and the latest inventory push succeeded, report “ready/pushed; live verification pending” instead of a false mandatory blocker. A confirmed live RU rejection remains blocking.

2. **Mark and route Min/Max Stay fields**
   - Add required/readiness markers to Rooms → Room Type → Min Stay and Max Stay, with valid completed states.
   - Change the Step 5 MinStay blocker target and copy to point directly to these room fields, including the affected unit name where available.
   - Make blocker actions open the Rooms section, select the affected room, and focus the relevant field rather than displaying inert text.

3. **Remove duplicate unit mirrors and links safely**
   - Reconcile native ROL'OS mirror rows against the 9 authored room types using stable IDs first and normalized names only as a fallback.
   - Preserve the current RU mappings for the intended units, including 5763142, 5763144, 5763145, 5763146, and 5763147; deactivate stale duplicate/legacy mirror rows rather than deleting history.
   - Deactivate stale Rate Plan links and leave one active plan-to-unit link per canonical authored unit.
   - Stop Property Save and legacy Rate Plan seeding from creating or reactivating duplicate mirrors/links; Rate Plans remains the sole commercial rate author.

4. **Validate Seesig end to end**
   - Confirm the Rate Plan editor shows one Rack plan linked once to each of the 9 authored units.
   - Confirm Step 5 sees MinStay from Rooms, 365-day open availability from the normalized Calendar window, and pricing from Rack/unit fallback where no seasonal amount exists.
   - Re-run readiness and ARI push/read-back for the five reported RU units and verify the false blockers clear without weakening genuine closed/unpriced-unit failures.

## Technical details

- Reuse the shared rate resolver; do not add another pricing path or remove compatibility shims.
- Share one local availability-window evaluator between readiness and push semantics so they cannot drift again.
- Add focused tests for: no manual rows, room Min/Max inheritance, full fallback pricing, empty live read-back after a successful push, genuine live closure, and duplicate-mirror reconciliation.
- Preserve adapter locks and authoritative inventory rules; no booking-orchestrator changes are required.
