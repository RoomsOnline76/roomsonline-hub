# Hostfully availability — final resolution (2026-07-06)

## Root cause (recap)
For ONE46 ON M and other Hostfully hotel / multi-unit properties, the adapter
was summing per-leaf-unit `/property-calendar` endpoints (`available_units = 1|0`)
to compute per-room-type inventory. OTA / channel bookings held against the
parent Room (unassigned to a specific leaf) never flip any leaf calendar to
unavailable, so ROLOS overcounts and drifts high as the date range extends.

Reservation-based deduction was a stopgap; the real fix is switching the
primary source to Hostfully's unit-type inventory (Rooms-to-Sell parity).

## Fix (shipped)
`handleFetchAvailability` in `supabase/functions/hostfully-api/index.ts` now:

1. For every ROLOS room type with a `hostfully_room_id` (unit-type UID), calls
   `fetchHostfullyUnitTypeInventory(uid, start, end)` FIRST. It tries the
   following endpoints in order and returns per-date inventory counts as soon
   as one responds with data:
   - `GET /multi-units/unit-types/{uid}/availabilities?startDate&endDate`
   - `GET /multi-units/availabilities?unitTypeUid={uid}&startDate&endDate`
   - `GET /availabilities?propertyUid={uid}&startDate&endDate`
   - `GET /availabilities?unitTypeUid={uid}&startDate&endDate`
2. When inventory is available, `dateAvailMap` is populated directly from it
   and marked `inventoryAuthoritative = true`. Only ONE leaf `/property-calendar`
   is still fetched to hydrate rates for `rate_types`.
3. Leaf-calendar aggregation and reservation deduction are BOTH skipped for
   authoritative room types — Hostfully's inventory already reflects
   reservations, so deducting again would double-count.
4. When no inventory endpoint returns data, the adapter cleanly falls back to
   the previous leaf-aggregation + lead-deduction path.

## Hardening
`.lovable/ADAPTER_LOCKS.md` now lists every PMS adapter region that requires
explicit user approval before edits. The Hostfully adapter carries a prominent
`🔒 ADAPTER LOCK` banner in the file header and around the inventory helper.
A matching memory rule was saved so future turns respect the lock.

## Validation
Deploy `hostfully-api`, then sync ONE46 ON M for the same window as the user's
screenshot. Compact Studio should read 6,5,4,2,2,2,2,2,2,1,1,1,1,1 and match
Hostfully's Rooms to Sell exactly.
