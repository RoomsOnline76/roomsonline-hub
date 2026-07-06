## Problem
For ONE46 ON M (Hostfully building), ROLOS Compact Studio / Studio availability matches Hostfully on the first 2 nights (0, 6, 5) then drifts high (ROLOS 9 vs PMS 1–2). Root cause: `fetch_availability` in `hostfully-api` aggregates each leaf unit's `/property-calendar` as `available_units = 1|0`. This works only when Hostfully has already assigned a booking to a specific leaf unit. OTA / channel bookings held against the parent Room (unassigned to a leaf) never flip any leaf calendar to unavailable, so ROLOS overcounts and diverges as the range extends.

Verified by ordered date-by-date comparison of the user's screenshot:
- Mon 06: ROLOS 0 = PMS Sold ✓
- Tue 07: 6 = 6 ✓
- Wed 08: 5 = 5 ✓
- Thu 09: 5 vs 4 (drift starts) …
- Tue 14: 9 vs 2 (biggest drift)

## Fix
Deduct real reservations from the aggregated per-night availability inside `fetch_availability`.

### Steps (all in `supabase/functions/hostfully-api/index.ts`)

1. **Collect the full set of Hostfully UIDs to query for reservations** per property:
   - Building UID (`properties.external_id` / `hostfully_property_uid`).
   - Every leaf unit UID discovered via `unitMapByRoomType` and `roomTypeRows.hostfully_room_id`.

2. **Fetch reservations** for the date window (`startDate`…`endDate`) by calling `/leads?propertyUid=<uid>&checkInDate=<start>&checkOutDate=<end>` for each UID (batched ≤ 5 concurrent). Merge, dedupe by lead id. Ignore statuses `CANCELLED`, `DECLINED`, `IGNORED`, `EXPIRED`.

3. **Assign each reservation to a room type**:
   - If the reservation's `propertyUid` maps to a leaf unit in `unitMapByRoomType` → assign to that room type.
   - Else if it maps to the building UID → assign to the room type whose `hostfully_room_id` matches the reservation's `roomTypeUid`/`roomUid` (Hostfully returns this on the lead when the building has multiple Rooms).
   - Else skip and log.

4. **Build a `bookedByRoomTypePerNight` map** by iterating each night `checkInDate ≤ n < checkOutDate` and incrementing `roomType → date → count`.

5. **Adjust aggregation** after the existing `dateAvailMap` fill:
   ```ts
   const bookedForType = bookedByRoomTypePerNight.get(roomType.id);
   for (const [date, data] of dateAvailMap) {
     const booked = bookedForType?.get(date) ?? 0;
     data.available = Math.max(0, data.available - booked);
   }
   ```
   Only deduct bookings that were **not already** reflected in a leaf calendar being marked unavailable — safest approach: track leaf UIDs whose calendar already showed the date as unavailable and skip deduction for reservations pinned to those leaves.

6. **Cache** the corrected `available_units` into `pms_availability_cache` (existing upsert), and also stamp `restrictions.stop_sell = true` when the corrected count is 0.

7. **Log summary** per sync: `Deducted N reservations across M room types` for observability.

### Guardrails
- Never go below zero.
- If `/leads` fails, warn and fall back to raw calendar counts (never fail the whole sync).
- Respect existing 2 req/sec rate limiter used elsewhere in the file.

## Out of scope
- Rate/price divergence (rates already reconciled).
- Restrictions (stop sell / min stay) — untouched.
- Non-Hostfully PMS adapters.

## Files
- `supabase/functions/hostfully-api/index.ts` — extend `fetch_availability` handler with reservation-aware deduction; add helper `fetchAndBucketReservations()`.

## Validation
After deploy, sync ONE46 ON M and re-check the same window against the PMS screenshot: Compact Studio should read 6,5,4,2,2,2,2,2,2,1,1,1,1,1 and match Hostfully's Rooms to Sell.
