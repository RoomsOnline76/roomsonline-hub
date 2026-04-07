
Goal: make Benson ARI resolve consistently on the admin calendar and checkout-related pages by removing the remaining cache-only / adapter-specific gaps.

What I found

1. `src/pages/CalendarAccommodation.tsx`
- Still calls `${external_system}-api` directly for live PMS fetches.
- For Benson this means a large live fetch can still happen whenever cache is stale/missing, instead of using the same unified ARI path as checkout.

2. `src/components/RoomAvailabilityCalendar.tsx`
- Only Hostfully has a live-refresh path.
- Benson falls into the generic cache-only branch.
- That branch queries `pms_availability_cache` with `external_room_type_id = roomId`, which can fail if the UI is holding the DB UUID while the cache stores the PMS-native Benson room code.

3. `src/pages/Booking.tsx`
- The checkout date-picker availability reads `pms_availability_cache` for the whole property, not the selected room, then writes one value per date. With multiple room types, later rows overwrite earlier rows, so availability/rates become unreliable.
- Cost calculation uses the orchestrator, but room matching still does not explicitly use Benson `external_room_type_id`, so it can miss valid live ARI results unless name fallback happens to succeed.

Implementation plan

1. Standardize live Benson ARI reads through the unified orchestrator
- Update `CalendarAccommodation.tsx` to use `booking-orchestrator-api` for live PMS-backed availability instead of calling `benson-api` directly.
- Keep cache-first behavior, but use the orchestrator as the refresh path so Benson, Hostfully, Hotelbeds, and HyperGuest follow one contract.

2. Add robust room-ID alias matching for Benson
- Introduce a small shared helper to resolve a room by:
  - DB UUID (`room_type_id`)
  - PMS-native ID (`external_room_type_id`)
  - cached raw PMS ID (`raw_data.roomTypeId`)
  - exact room name / normalized room name
- Reuse this in:
  - `RoomAvailabilityCalendar.tsx`
  - `Booking.tsx`
  - optionally `CalendarAccommodation.tsx` transform logic if needed

3. Fix room calendar loading for Benson
- In `RoomAvailabilityCalendar.tsx`, replace the Hostfully-only live branch with a generic “live PMS” branch.
- Flow:
  - load cache immediately if available
  - resolve the selected room using aliases
  - fetch fresh ARI through `booking-orchestrator-api`
  - merge the matched room back into the calendar
- This removes the current Benson cache-only dead end.

4. Fix checkout date-picker ARI on `Booking.tsx`
- Stop building `calendarAvailability` from all property rows with last-row-wins behavior.
- If a room is preselected, resolve ARI for that room only.
- If no room is selected yet, aggregate correctly by date:
  - available = any room available
  - rate = lowest valid rate across available rooms
- Prefer orchestrator/live PMS for Benson, with cache as fallback.

5. Tighten checkout cost matching
- In `Booking.tsx`, extend room matching so a live Benson room matches when:
  - `room.roomTypeId === room_type_id`
  - `room.roomTypeId === external_room_type_id`
  - room alias list contains either ID
  - raw cached PMS ID matches
  - then name fallback
- This should remove the remaining “ARI fetched but room not resolved” gap during checkout pricing.

6. Add targeted diagnostics
- Add concise logs around:
  - requested room id/name
  - matched room source (uuid / external id / name)
  - whether ARI came from cache or live orchestrator
  - number of dates resolved
- This will make Benson-specific failures traceable without flooding logs.

Files likely to change
- `src/pages/CalendarAccommodation.tsx`
- `src/components/RoomAvailabilityCalendar.tsx`
- `src/pages/Booking.tsx`
- `src/lib/pmsUtils.ts` or a small new shared room-alias helper under `src/lib/`

What will not change
- No database migration needed
- No credential changes needed
- No Benson adapter contract rewrite required; this is mainly a consumer-side resolution fix using the unified orchestrator and better ID matching

Expected outcome
- Admin calendar loads Benson ARI without falling back into inconsistent adapter-specific behavior
- Room calendar loads Benson data even when the selected room is referenced by DB UUID
- Checkout date picker shows correct availability/rates
- Checkout pricing resolves Benson room ARI reliably instead of silently missing the matched room
