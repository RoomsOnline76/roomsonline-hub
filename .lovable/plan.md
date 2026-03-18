
Issue restated (what is still broken):
- Paid booking-bar bookings are not reducing availability / blocking dates in any calendar surface (`/pms/calendar`, `/admin/calendar/accommodation`, embeds).
- This means the previous patch did not close the full booking→inventory pipeline.

What I verified in the current system:
1) Recent bookings for Latter Days are `paid + confirmed`, but:
- `external_reservation_id` is null
- `booking_sync_status` has no `roomsonline` rows
2) `pms_availability_cache` for this property exists under `system_type='rol'` (not `roomsonline`)
3) `roomsonline-pms-api` currently queries with `system_type='roomsonline'`, so availability lookups miss live cache rows
4) `push-booking` fallback guard currently requires `booking.status !== 'confirmed'`, but PayFast sets `status='confirmed'` before calling push-booking — so fallback block logic is skipped when ROL sync fails
5) Existing `property_availability` manual blocks exist, but:
- `/admin/calendar` PMS path uses cache data, not those manual rows as source-of-truth
- embed grid is currently static (room default rates), not live availability-aware
6) `/pms/calendar` room matching uses `booking.room_type_id === rolos_room_types.id`; booking-bar bookings often store overview UUIDs (`hostfully_room_types.id`) so bookings do not render on the expected room rows

Implementation plan

1. Fix booking confirmation fallback in `push-booking`
- File: `supabase/functions/push-booking/index.ts`
- Replace status-based fallback gate with explicit ROL-failure flag.
- Extract shared “local block + notify” helper and call it when:
  - ROL adapter throws
  - ROL adapter returns non-success
- Do not depend on `booking.status` for fallback eligibility.
- Also write explicit `booking_sync_status`/`sync_logs` entries for roomsonline success/failure so this is observable.

2. Fix ROL cache lookup + room mapping in `roomsonline-pms-api`
- File: `supabase/functions/roomsonline-pms-api/index.ts`
- Keep adapter source as roomsonline, but read/write cache rows using the property’s actual cache system type (`rol` or `roomsonline`), with backward-compatible support for both.
- Improve UUID→external room ID resolution:
  - map via `hostfully_room_types.id`
  - map via `hostfully_room_types.linked_rolos_id`
  - fuzzy/contains fallback on normalized names (to handle names like “3 Bedroomed Holiday House” vs “Holiday House”)
- Ensure `rolos_inventory_calendar.room_type_id` receives internal UUID room type IDs (not slug/external IDs).

3. Make calendar/embed consumers reflect blocked inventory
- `src/pages/pms/PMSDashboard.tsx`
  - booking row matching should accept either:
    - `booking.room_type_id === rolos_room_types.id`
    - `booking.room_type_id === rolos_room_types.linked_overview_id`
- `src/pages/CalendarAccommodation.tsx`
  - for PMS properties, overlay `property_availability` overrides onto displayed PMS room/date rows (stop-sell/available units), so fallback blocks are visible.
- `src/pages/EmbedProperty.tsx`
  - replace static `ratesByDate` generation with live date-wise availability + rates from cache (+ override merge).
  - render sold/blocked dates when `available_units <= 0` or stop-sell is active.

4. One-time repair for already-paid bookings
- Add a migration/backfill script to repair paid bookings that missed inventory updates:
  - target confirmed+paid bookings for this property in affected date windows
  - map room IDs correctly
  - decrement/mark cache availability for booked nights
  - upsert `rolos_inventory_calendar`
  - ensure property-level overrides exist where required
- Normalize legacy room ID linkage for affected paid bookings where possible (overview UUID → linked rolos UUID) to restore PMS calendar visibility.

Technical details (why this failed)
- Failure cascade:
  1) PayFast marks booking confirmed
  2) ROL adapter lookup misses cache (`rol` vs `roomsonline`)
  3) push-booking fallback is skipped because booking already confirmed
  4) no inventory mutation reaches cache/calendar/embed pipelines
- So this is not one bug; it is a chain across payment handler, push-booking control flow, adapter cache keying, and UI data sources.

Validation plan after implementation
1) Create one test booking via booking bar (paid flow)
2) Confirm:
- `/admin/calendar/accommodation` shows blocked/updated availability on booked dates
- `/pms/calendar` shows the booking on the correct room row + arrivals/departures coherence
- embed grid shows sold/blocked dates and correct daily rates
3) Confirm backend records:
- `booking_sync_status` has roomsonline sync event
- `pms_availability_cache` changed on booked dates
- `rolos_inventory_calendar` rows exist for booked nights
- `sync_logs` include success/fallback trace
