# RU-aligned room/unit amenities

## Current state (verified)
- The Amenities sub-tab in `src/components/property/RoomManagerTab.tsx` offers only 4 hardcoded groups (~29 free-text labels: Bathroom, Bedroom, Food & Drink, Internet). Selections are stored as label strings on `amenities.room_types[].amenities`.
- `supabase/functions/push-property-to-ru/index.ts` maps those labels to RU IDs through a hand-written `AMENITY_MAP` of ~50 keys — none of which match the labels shown in the UI (e.g. "Free WiFi" vs key `wifi`), so most selections do not map and the push pads amenities to reach RU's minimum of 10.
- `rentalsunited-api` supports `Pull_ListCompositionRooms_RQ` but has **no** `Pull_ListAmenities_RQ` action, so RU's real amenity dictionary has never been fetched.
- `RU_MIN_AMENITIES = 10` exists in `_shared/ruReadiness.ts` but is checked at property level only; rooms are only checked for "has beds/amenities".

## What to build

### 1. Fetch RU's amenity dictionary
- Add a `list_amenities` action to `supabase/functions/rentalsunited-api/index.ts` issuing `Pull_ListAmenities_RQ` with master auth, plus a parser handling both attribute (`<Amenity AmenityID="6">`) and child-element response shapes.
- New table `ru_amenities` (id int PK, name, category/static-group, is_active, synced_at) with GRANTs + RLS (read: authenticated; write: service_role only), populated by an admin-triggered `sync_amenities` action so the catalogue is cached and offline-safe.

### 2. Canonical catalogue + mapping
- New `src/lib/ruAmenities.ts`: loads cached RU amenities, groups them into readable sections (Bathroom, Bedroom, Kitchen, Entertainment, Outdoor, Safety, Accessibility, Services, Internet, General), and exposes helpers to search/filter.
- New shared `supabase/functions/_shared/ruAmenityMap.ts`: replaces the ad-hoc `AMENITY_MAP` with an alias table covering both the new RU-ID-based selections and every legacy label (so existing properties keep their data). Selections are stored going forward as `ru:<id>` tokens alongside a display name; legacy strings are resolved via the alias table.

### 3. Rebuild the Amenities sub-tab (ROLOS Property Setup → Rooms → Amenities, and /admin/edit property → Rooms → Amenities)
- Replace the 4 hardcoded columns with a grouped, searchable, collapsible checklist rendered from the RU catalogue (full option set, not a subset).
- Header strip: live counter `X / 10 selected`, progress bar, "Copy amenities from another room type" and "Clear" actions; PMS-synced amenity banner preserved.
- Amber warning under 10, green once satisfied; the count is per room type.

### 4. Enforce the 10-amenity minimum before submission
- Add a `rooms_meet_minimum_amenities` blocker to `_shared/ruReadiness.ts` (RU_MIN_AMENITIES per room/unit), surfaced in `PushToRentalsUnited.tsx` with a deep link to the offending room's Amenities tab.
- `push-property-to-ru` fails with `RU_ROOM_AMENITIES_BELOW_MIN` instead of padding room-level amenities; property-level padding warning stays.

## Technical notes
- RU credentials/owner scoping reuse the existing resolver in `rentalsunited-api`; no adapter-locked regions are touched (`.lovable/ADAPTER_LOCKS.md` does not cover the amenity path).
- Migration includes GRANTs for `authenticated` (select) and `service_role` (all) on `ru_amenities`.
- If the live `Pull_ListAmenities_RQ` call returns an error for our account, the catalogue falls back to a seeded snapshot committed in `ruAmenities.ts` so the UI still ships the expanded list.
