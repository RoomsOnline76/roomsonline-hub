## Goal
On the booking/checkout flow for ROLOS-native properties (like Dassiesingel), quote each unit using its per-season **room rate from the admin Rates Calendar** first, and only fall back to the ROLOS **Rate Plan base rate** when no seasonal rate exists for that room+date.

## Findings
- Per-room seasonal rates shown in `/admin/edit property/rates/calendar` (e.g. BOSBOK R700, DASSIE R550, GRYSBOK R550, STEENBOK R1000) are stored in `properties.amenities.season_rates`, keyed by:
  - amenity room id (timestamp, matches `rolos_room_types.linked_overview_id`)
  - sub-key `"{seasonId}-{rateTypeId}"` → `{ roomAmount, adultAmount, teenAmount, childAmount, infantAmount }`
  - active seasons live in `amenities.seasons` with `from`/`to` (or `start_date`/`end_date`).
- The new normalized `rolos_rate_prices` table exists but is currently empty for Dassiesingel — the calendar UI still writes to `amenities.season_rates`, so it is the authoritative source today.
- `booking-orchestrator-api → resolveRolosRates` currently only reads `hostfully_room_types.daily_rate` and the linked `rolos_rate_plans.base_rate`. It never looks at `amenities.season_rates`, so per-room seasonal rates from the admin calendar are ignored on the book page.
- The book-page date-picker preview in `src/pages/Booking.tsx` also only uses the first wizard room's linked rate type, so it misses per-room seasonal rates.

## Implementation plan

1. **Backend: teach the orchestrator to read seasonal room rates first**
   - In `supabase/functions/booking-orchestrator-api/index.ts → resolveRolosRates`:
     - Fetch `properties.amenities` (seasons + season_rates) alongside the existing `hostfully_room_types` query.
     - Also fetch `rolos_room_types (id, linked_overview_id)` for the property so each hostfully mirror row can map to its amenity room id via `linked_rolos_id → rolos_room_types.id → linked_overview_id`.
     - Build a resolver `getDailyRoomAmount(amenityRoomId, dateStr)` with priority:
       1. If a season contains `dateStr`, look up `season_rates[amenityRoomId]["{seasonId}-{ratePlanId}"]` for the linked active rate plan; then any `"{seasonId}-*"` sub-key with `roomAmount > 0`.
       2. Also try `season_rates[rolosRoomTypeId]` and `season_rates[roomName]` as secondary keys (matches existing PMSDashboard fallback order).
       3. Otherwise use `rolos_rate_plans.base_rate` (linked plan) as today.
       4. Finally `hostfully_room_types.daily_rate` (last-resort legacy).
     - Use that resolver when building the `dailyRates` array per date so each night's `room_amount` reflects the correct season+room, not one flat rate. Preserve existing `rolos_rate_plan_stop_sell` stop-sell handling.
     - Return `pricing_model` from the linked rate plan (per-room vs per-person) unchanged.

2. **Frontend: align book-page calendar preview**
   - In `src/pages/Booking.tsx` (`fetchAvailability` effect, ~L370-510) for `roomsonline` properties:
     - When a room is preselected (`preSelectedRoomTypeId`/`preSelectedRoomTypeName`), pick that wizard room; otherwise iterate over wizard rooms and aggregate.
     - Replace the flat `baseRate` per date with the same seasonal resolver as step 1 (walk `amenities.seasons` + `season_rates` per date, keyed by that room), falling back to linked rate-plan/room base rate.
   - Keep other logic (blocked dates from `property_availability`, calendar map shape) untouched.

3. **Frontend: safety net in checkout total**
   - In `Booking.tsx → calculateCost` zero-total fallback (~L1174-1217), extend the wizard fallback so it also consults `amenities.season_rates` for the current stay dates before returning the room's flat base rate. Rate-plan base_rate remains the last resort.

4. **Out of scope**
   - Existing PMS-backed paths (Hostfully/Benson/Hotelbeds/HyperGuest) — no changes.
   - Portfolio "from R" price — already fixed in the earlier change.
   - No DB schema changes; no migration of `season_rates` into `rolos_rate_prices`.
   - No change to VAT, charges, vouchers, or payment flow.

## Validation
- Book Dassiesingel from the portfolio: BOSBOK should quote R700/night (currently R1,000), DASSIE/GRYSBOK R550/night, STEENBOK R1,000/night for the "10-11 Jul" test dates.
- Selecting different date ranges spanning another season row must reflect that season's per-room rate.
- A property with only a rate plan (no `season_rates`) must still quote correctly via the plan's `base_rate`.