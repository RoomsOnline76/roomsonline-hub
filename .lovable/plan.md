

# Audit: PMS Adapter Availability Response — room_type_id Contract

## The Problem

The adapter contract requires that `room_type_id` in the `fetch_availability` response be **the database UUID** from `hostfully_room_types.id`, so the frontend can match rooms without any prefix-stripping or secondary lookups. Currently, the frontend (`Booking.tsx`) contains ~20 lines of workaround code doing DB lookups and prefix-stripping to bridge the gap. This is fragile and wrong.

## Current State per Adapter

| Adapter | `room_type_id` returned | Expected (DB UUID) | Broken? |
|---|---|---|---|
| **HotelBeds** | PMS native code (`DBT.DX-4`) | `69c53acc-bfce-4bf9-...` | **YES** |
| **Benson** | PMS native code (`1431`) | `2260403f-0404-4884-...` | **YES** |
| **Hostfully** | `hostfully_room_id` (Hostfully UID) | Already matches DB `hostfully_room_id` field, plus passes `room_type_aliases: [db_uuid]` | **Partial** — returns the UID not the DB UUID |
| **HyperGuest** | PMS native `room.code` | DB UUID needed | **YES** |
| **Cloudbeds** | PMS native `roomTypeID` | DB UUID needed | **YES** |
| **Little Hotelier** | PMS native `room-id` | DB UUID needed | **YES** |

## The Fix — Per Adapter

Each adapter already receives `property_id` (the DB UUID of the property). On `fetch_availability`, each adapter must:

1. Query `hostfully_room_types` for the given `property_id` to build a **PMS code → DB UUID** lookup map
2. Replace `room_type_id` in the response with the DB UUID
3. Include the original PMS code as `external_room_type_id` (for caching purposes, which already uses this field correctly)

### Step 1: Create a shared utility function
Add a helper in each adapter (or inline) that queries the DB:
```sql
SELECT id, hostfully_room_id FROM hostfully_room_types 
WHERE property_id = $1 AND is_active = true
```
Then builds a map: `{ "DBT.DX-4": "69c53acc-...", "1431": "2260403f-..." }` by stripping the adapter prefix from `hostfully_room_id`.

### Step 2: Fix each adapter's transform function

**hotelbeds-api** (`transformAvailability`):
- Line 531: Change `room_type_id: room.code` → look up the DB UUID from the map, falling back to `room.code` if not found.

**benson-api** (line 800):
- Change `room_type_id: roomType.roomTypeId` → look up DB UUID from map.

**hyperguest-api** (line 336):
- Change `room_code: room.code` in the response → add `room_type_id` mapped to DB UUID. Also restructure the response to use the standard `room_types[]` format with `rooms_available_per_night` and `rate_types` (currently uses a non-standard `rooms[]` with `rates[]` shape).

**cloudbeds-api** (line 429):
- Change `room_type_id: rt.roomTypeID` → look up DB UUID from map.

**little-hotelier-api** (line 222):
- Change `room_type_id: roomId` → look up DB UUID from map.

**hostfully-api** (line 1031):
- Already uses `roomType.hostfully_room_id || roomType.id` — should prefer `roomType.id` (the DB UUID) as `room_type_id` and keep `hostfully_room_id` as `external_room_type_id`.

### Step 3: Clean up frontend workarounds in Booking.tsx
Remove the `hfRoomIdMap` DB lookup, the `pmsRoomCode`/`dbPmsCode` prefix-stripping logic, and the `hostfully_room_id` URL parameter handling. The room matching should simply be:
```typescript
roomTypesArray.find(rt => rt.room_type_id === room.roomTypeId)
```

### Step 4: Update pmsLiveAvailability.ts
The `fetchLiveRates` consumer in `pmsLiveAvailability.ts` already reads `room_type_id` generically (line 109). Once adapters return DB UUIDs, the portfolio page and embed page can match by DB UUID directly — no changes needed here.

### Step 5: Fix HyperGuest response shape
HyperGuest currently returns a completely different shape (`rooms[]` with nested `rates[]` and `daily_rates[]`) instead of the standard `room_types[]` with `rooms_available_per_night[]` and `rate_types[].rates[]`. This must be normalized to match the adapter contract so `pmsLiveAvailability.ts` can parse it consistently.

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/hotelbeds-api/index.ts` | Add DB UUID lookup; replace `room.code` with UUID in `transformAvailability` |
| `supabase/functions/benson-api/index.ts` | Add DB UUID lookup; replace `roomType.roomTypeId` with UUID |
| `supabase/functions/hyperguest-api/index.ts` | Add DB UUID lookup; normalize response to standard `room_types[]` shape |
| `supabase/functions/cloudbeds-api/index.ts` | Add DB UUID lookup; replace `rt.roomTypeID` with UUID |
| `supabase/functions/little-hotelier-api/index.ts` | Add DB UUID lookup; replace `roomId` with UUID |
| `supabase/functions/hostfully-api/index.ts` | Swap to prefer `roomType.id` as `room_type_id` |
| `src/pages/Booking.tsx` | Remove `hfRoomIdMap`, `pmsRoomCode`, `dbPmsCode` workarounds; simplify to direct UUID match |
| `src/pages/EmbedProperty.tsx` | Remove `hostfully_room_id` URL param passing (no longer needed) |

## Risk Mitigation
- Each adapter falls back to the PMS-native code if no DB UUID mapping is found (graceful degradation for unmapped rooms)
- The `external_room_type_id` field in `pms_availability_cache` continues to use the PMS-native code (no cache schema change needed)
- Deploy and test one adapter at a time, starting with HotelBeds (the reported broken one)

