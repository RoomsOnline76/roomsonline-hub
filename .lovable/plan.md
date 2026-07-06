
## Diagnosis

The Property Form (Room Types) reads directly from `hostfully_room_types` and correctly lists all 5 units: **2 Bedroom, Studio, 1 Bedroom, Compact Studio, Compact 1 Bedroom**.

The ROL Calendar reads `pms_availability_cache` through `booking-orchestrator-api → transformCacheToAvailability`. For ONE46 ON M (`464c5d9f…`) the cache currently contains only 4 rows per date in the visible window:

| external_room_type_id | cached name |
|---|---|
| `46fa0c63…` | Compact Studio |
| `5861b321…` | Studio |
| `97536287…` | 1 Bedroom |
| `c7166dba…` | **"Property"** (this UUID is actually "2 Bedroom") |

`cffcaa35…` (Compact 1 Bedroom) is not in the cache at all → the row is missing. `c7166dba…` (2 Bedroom) is in the cache but labelled `"Property"` → the ghost row.

Root cause is in the Hostfully adapter:

1. `hostfully_room_types.hostfully_room_id` is **NULL for all 5 rows** on ONE46. The multi-unit code path (`handleFetchAvailability`, hostfully-api ~line 922) filters those out with `filter(r => !!r.hostfully_room_id)` and the array becomes empty.
2. The code then falls to the single-unit path, which asks `resolveHostfullyPropertyUid` for a building UID. That helper (line 216-224) grabs `amenities.room_types[0].pmsRoomId`. For ONE46 that value is `c7166dba…`, which is a **ROL UUID, not a Hostfully UID**. The adapter then calls `/property-calendar/c7166dba…`, caches whatever comes back under `external_room_type_id = c7166dba`, and — because no `hostfully_room_types` row has `hostfully_room_id = c7166dba` — defaults `roomName` to the string `"Property"` (line 1111). That row also has bogus ARI, which is why the numbers in the ROL calendar don't match the Hostfully PMS calendar.
3. The other 3 room UUIDs in the cache are stale rows from a previous sync that happened to use the correct ROL UUIDs; `Compact 1 Bedroom` was never touched by that older run, so it is missing entirely.

## Fix

### 1. Repair `hostfully_room_types.hostfully_room_id` mapping (root cause)

- Call Hostfully `list_properties` / multi-unit endpoint for the agency, match child units by name against `hostfully_room_types.name`, and populate `hostfully_room_id` for each ROL room type row. Handles the name mismatch (`"2 Bedroom"` in ROL vs `"Two-Bedroom Apartment"` in Hostfully) by writing a small name-normaliser (strip words like `Apartment`, collapse `One`↔`1`, case-insensitive).
- Expose this as a "Repair Hostfully mapping" action in the existing Hostfully building importer (`HostfullyBuildingImporter.tsx`) and run it once for ONE46 ON M.

### 2. Stop the adapter from writing garbage when the mapping is broken

Edit `supabase/functions/hostfully-api/index.ts`:

- `resolveHostfullyPropertyUid`: remove the `amenities.room_types[0].pmsRoomId` fallback (line 220). ROL UUIDs must never be sent as Hostfully building UIDs. If nothing resolves, return null and let the caller surface a real error instead of silently mis-syncing.
- `handleFetchAvailability`:
  - If `roomTypes` come back with **no** `hostfully_room_id`, return a structured error (`NO_HOSTFULLY_MAPPING`) instead of falling through to the single-unit path.
  - Single-unit path: never default `roomName` to `"Property"`. If we cannot find a matching `hostfully_room_types` row by `hostfully_room_id`, refuse to cache and return an error.

### 3. Purge and refresh the poisoned cache

- Delete existing `pms_availability_cache` rows for ONE46 that no longer correspond to any active `hostfully_room_types.id`, and specifically the `c7166dba` rows labelled `"Property"`.
- Trigger a fresh sync after the mapping is repaired.

### 4. Defensive filter in the orchestrator

Edit `supabase/functions/booking-orchestrator-api/index.ts` `transformCacheToAvailability` (called from `resolveFromCache`):

- Pass through the property's active `hostfully_room_types.id` set and drop cache rows whose `external_room_type_id` is not in that set. This guarantees the calendar can never display a room the property doesn't actually own, even if stale cache rows are left over from previous adapter bugs.
- Prefer the current `hostfully_room_types.name` over `raw_data.roomTypeName` when building `room_type_name`, so a poisoned `"Property"` label can never surface again.

### 5. Frontend safety net

`src/pages/CalendarAccommodation.tsx` `calendarRoomData` (~line 1142): when the PMS response is present, cross-check each returned room against `hostfully_room_types` for the property (already fetched for `roomCategoryMap` at line 1387) and:

- drop any room whose id/name is not in that set (kills any residual ghost rows), and
- append entries for room types that exist in `hostfully_room_types` but are missing from the PMS response, marked as "no data" so the operator can see them.

## Verification

After applying the fix and re-syncing ONE46 ON M:

- Property Form and ROL Calendar both list exactly the same 5 room types.
- No "Property" row.
- Availability and rates per room match what the Hostfully PMS calendar shows for the same date window.
- Run the same check on one other Hostfully property (e.g. another multi-unit building) to confirm nothing regressed.

## Technical notes

- Files touched: `supabase/functions/hostfully-api/index.ts`, `supabase/functions/booking-orchestrator-api/index.ts`, `src/pages/CalendarAccommodation.tsx`, `src/components/pms/HostfullyBuildingImporter.tsx` (+ new small helper for name normalisation).
- Data operations: one-off SQL to clear stale cache rows for ONE46 (and any other property with `hostfully_room_id IS NULL` across all its room types), plus the mapping backfill triggered from the importer.
- No schema changes required.
