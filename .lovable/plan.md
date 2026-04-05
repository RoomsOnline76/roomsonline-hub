

# Fix Specials/Packages Not Applied After Adapter Contract Fix

## Root Cause

The specials' `applicable_room_ids` store **legacy wizard numeric IDs** (e.g. `1`, `1772973704081`) from `amenities.room_types[].id`. After the adapter contract fix, `rooms[].roomTypeId` is now the **DB UUID** (e.g. `c8253bc0-4449-422a-bf7e-b215b7aef83e`). The room matching logic on lines 1612-1627 tries to bridge these but fails because:

- `String(amenityRoom.id)` is `"1"` — doesn't match DB UUID `c8253bc0-...`
- `amenityRoom.linked_rolos_id` doesn't exist in the amenities JSONB — that field lives on `hostfully_room_types`

The specials are fetched and displayed (via `SpecialsBanner` which does its own matching), but the **calculation** skips them because `hasMatchingRoom` is always `false`.

## Fix

In `src/pages/Booking.tsx`, enhance the room matching inside the specials/packages calculation (lines 1607-1628) to bridge the DB UUID through `hostfully_room_types` → amenity room by name:

1. **Before the specials loop** (around line 1593): Build a lookup map from DB UUID → legacy amenity room IDs. Query `hostfully_room_types` (already available as `hfRooms` in scope from the rate resolution block) to get `{id: DB_UUID, name: "3 Bedroomed Holiday House"}`, then find the matching amenity room by name to get its legacy numeric ID.

2. **In the `hasMatchingRoom` check** (line 1612): Add a new branch that checks if the DB UUID maps to a legacy amenity ID via the bridge map, and if that legacy ID is in `applicable_room_ids`.

3. **Same fix for packages** (line 1525 block): Packages also use `applicable_room_ids` — apply the same bridging logic there if room filtering exists.

## Technical Detail

```
DB UUID (c8253bc0-...)  →  hostfully_room_types.name ("3 Bedroomed Holiday House")
                        →  amenities.room_types.find(r => r.name === name).id (1)
                        →  applicable_room_ids.includes(1) ✓
```

The `hfRooms` query already exists in the `calculateCost` scope (line 944). We need to either:
- Hoist it to component state so it's accessible in the specials section, OR
- Query it once more inside the specials block (less ideal but contained)

Best approach: store `hfRooms` in a `useRef` or state variable when first fetched (line 944-948), then reference it in the specials matching.

## Files Changed

| File | Change |
|---|---|
| `src/pages/Booking.tsx` | Store `hfRooms` in state; build UUID→legacy-ID bridge map; use it in specials and packages `applicable_room_ids` matching |

