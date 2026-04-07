

# Fix: Pensioners Special Not Showing + Age Verification

## Root cause analysis

Two issues found:

1. **Special not appearing in cart**: The `applicable_room_ids` on the special contains legacy amenity IDs (`['1775154602014', ...]` as text). The room matching bridge relies on `hfRoomsRef` being populated correctly, but when the orchestrator pre-populates it (line 818-820), the bridge may not contain the exact booked UUID, causing the name-based fallback path to silently fail. Adding a more direct name-based match that doesn't depend on the bridge will fix this.

2. **Cannot upload ID**: The special has `age_restricted = false` in the database, but the terms clearly state "All persons must be 55 years of age or older." With the flag off, no `AgeVerificationUpload` component is rendered. Need to set `age_restricted = true` and `min_age = 55` via a migration.

## Changes

### 1. Database migration — set age restriction on the special

```sql
UPDATE property_specials
SET age_restricted = true, min_age = 55
WHERE id = '26400dbf-e245-4896-be67-3197bad5f2e7';
```

### 2. Fix room matching in `src/pages/Booking.tsx` (lines ~1264-1303)

Add a **direct name-based fallback** before the existing bridge logic. If the booked room's `roomTypeName` matches an amenity room name, and that amenity's ID is in `applicable_room_ids`, consider it a match — bypassing the UUID→legacy bridge entirely:

```
// After building uuidToLegacyIds bridge (line 1278), before hasMatchingRoom:
// Add direct room-name matching: match roomTypeName against amenitiesRooms
const hasMatchingRoom = bookedRoomIds.some(uuid => {
  // Direct UUID match
  if (special.applicable_room_ids.includes(uuid)) return true;
  if (special.applicable_room_ids.includes(String(uuid))) return true;
  
  // Bridge: UUID → legacy amenity ID
  const legacyIds = uuidToLegacyIds[uuid];
  if (legacyIds) {
    for (const lid of legacyIds) {
      if (special.applicable_room_ids.includes(lid)) return true;
    }
  }
  
  // NEW: Direct name match — find the room name for this UUID
  const bookedRoom = rooms.find(r => r.roomTypeId === uuid);
  const bookedName = bookedRoom?.roomTypeName || embedRoomTypeName;
  if (bookedName) {
    const amenityByName = amenitiesRooms.find((r: any) =>
      r.name?.trim().toLowerCase() === bookedName.trim().toLowerCase()
    );
    if (amenityByName && (
      special.applicable_room_ids.includes(String(amenityByName.id)) ||
      special.applicable_room_ids.includes(Number(amenityByName.id))
    )) return true;
  }
  
  return false;
});
```

This replaces the existing `embedRoomTypeName`-only fallback with one that also checks the room's own `roomTypeName` property.

### 3. Add debug logging for specials

Add `console.log` statements around the specials evaluation to trace matching in production:
- Log fetched specials count
- Log room matching result per special
- Log final applied/pending specials

## Files changed

| File | Change |
|---|---|
| `src/pages/Booking.tsx` | Improve room matching fallback, add debug logging |
| Migration | Set `age_restricted = true, min_age = 55` on the pensioners special |

