

# Fix Early Bird Special Not Applying on Checkout

## Root Cause

The room matching logic in the specials auto-apply code has two bugs:

1. **Wrong amenities key**: Line 1550 reads `property.amenities.rooms` — this key doesn't exist. The actual key is `room_types`. So the fallback amenity room lookup always returns an empty array and never matches.

2. **No cross-reference via linked_rolos_id**: The booking URL provides both `roomTypeId` (a hostfully/embed UUID) and `linked_rolos_id` (the ROL'OS UUID). The code only checks `roomTypeId` against `applicable_room_ids`. It never looks up the corresponding amenity room via `linked_rolos_id` or the `hostfully_room_types` table.

### Data Evidence (Latter Days)

| Source | ID |
|--------|----|
| URL `roomTypeId` | `c8253bc0-...` (hostfully room) |
| URL `linked_rolos_id` | `def44b86-...` (rolos room) |
| Amenity `room_types[0].id` | `1` (legacy) |
| Special `applicable_room_ids` | `[1, 1772973704081]` (legacy) |

The code tries `c8253bc0` against `[1, 1772973704081]` → no match. Then looks in `amenities.rooms` (empty) → no match. Special skipped.

## Fix — File: `src/pages/Booking.tsx` (~lines 1547-1558)

Update the room matching block:

1. Change `property.amenities.rooms` → `property.amenities.room_types`
2. Also check the `linked_rolos_id` from URL params and from room data against the amenity rooms
3. For each booked room, also look up the hostfully room's `linked_rolos_id` to find the matching amenity room by that ID

```text
Before (simplified):
  amenitiesRooms = amenities.rooms || []           ← WRONG KEY
  match uuid against applicable_room_ids directly  ← UUID never in list
  find amenityRoom by linked_rolos_id === uuid     ← amenitiesRooms is empty

After:
  amenitiesRooms = amenities.room_types || amenities.rooms || []
  For each booked roomTypeId:
    1. Direct match against applicable_room_ids
    2. Find amenity room where amenityRoom.id == roomTypeId
    3. Find amenity room where amenityRoom.linked_rolos_id == roomTypeId
    4. Use embedLinkedRolosId from URL params to find amenity room
    5. If any amenity room found, check String(amenityRoom.id) in applicable_room_ids
```

This is a single-file, ~15-line fix. No database or schema changes needed.
