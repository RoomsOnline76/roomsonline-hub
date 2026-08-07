# Groups & Packages — Acceptance Verification Run

The five acceptance checks all have implementing code in place (`pms-groups` edge function, the atomic inventory routines, `pms-night-audit` auto-release, master-folio support on `rolos_folios`). What has not been done is proving each one end to end against real data. This plan is that proof run, plus fixes for whatever fails.

## Check 1 — Creating a block drops availability

Create a test block on a test property/room type for a short date range, then verify for every night in the range:

- `rolos_inventory_calendar.blocked_units` increased by the blocked count and `available_units` dropped accordingly.
- `pms_availability_cache.available_units` dropped by the same amount, so the online booking engine and channel pushes stop selling those rooms.
- Re-query the availability the engine actually serves (`booking-orchestrator-api → fetch_availability`) and confirm the reduced number is what a guest would see.

## Check 2 — Pickup creates a real booking and converts blocked → booked

Pick up one room from the test block, then verify:

- A `bookings` row plus its `rolos_booking_rooms` line exist with the guest, dates and rate.
- The booking appears on the Room Plan (`/rolos/dashboard`) and the Room Type Plan (`/rolos/rooms`) for those dates.
- `blocked_units` went down by 1 and `booked_units` up by 1 for each night, with no net change to `available_units` (the block already reserved it).
- `picked_up_count` incremented, and the block flips to `converted` only once fully consumed.
- With a package attached, folio lines land split by revenue stream (accommodation vs F&B) and the booking total matches.

## Check 3 — Release restores availability and posts attrition

Two paths:

- **Manual release** from the group sheet: remaining held nights return to `rolos_inventory_calendar` and `pms_availability_cache`, block status becomes `released`.
- **Night-audit release**: set a block's release date in the past, run the audit, confirm it auto-releases and logs to `rolos_night_audit_log`.
- **Attrition**: with an attrition rate set and the cut-off date passed, confirm a charge is posted to the master folio, tagged as accommodation, and `attrition_charged` is set so a second release cannot double-charge. With no attrition configured, confirm nothing is posted.

## Check 4 — Master folio

- For a `master` or `hybrid` group, open the master folio from the Billing tab and confirm the folio row carries `group_id` (no `booking_id`) and that charges post to it.
- For an `individual` group, confirm per-booking folios behave exactly as before and no master folio is created.

## Check 5 — No regressions on existing paths

- Create a normal single reservation through the usual manual-booking flow and confirm inventory moves by exactly the right amount for each night (no double counting) and the availability cache matches.
- Confirm rate plans, per-night rate overrides and the breakfast/F&B split still calculate unchanged.
- Confirm no external PMS adapter behaviour changed: Hostfully, Rentals United, Benson, NightsBridge and Beds24 availability and booking paths are untouched, and the locked adapter regions stay locked.

## Deliverable

A short pass/fail report against the five checks with the observed numbers, and targeted fixes for any check that fails. Any fix stays inside the groups/packages code path and the inventory routines — no changes to adapter files, `booking-orchestrator-api` availability contracts, or the manual-booking dialog signature.

## Technical notes

- Verification uses direct database reads for inventory and folio state, and a browser pass for the Room Plan / Room Type Plan / Billing tab visuals.
- Test data is created on a single test property and cleaned up afterwards (blocks released, test bookings and folio lines removed, inventory restored to its starting values).
- The inventory routines remain the single writer of `blocked_units` / `booked_units`; any fix goes there rather than into ad-hoc inline updates.
