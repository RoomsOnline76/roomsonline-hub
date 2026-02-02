
# Fix Calendar Date Blocking for Manual Property Bookings

## Problem Identified

The edge function logs reveal a clear error:

```
null value in column "room_type" of relation "property_availability" 
violates not-null constraint
```

### Root Cause

**Property Format Mismatch**: The booking stores room data with snake_case keys (`room_type_id`, `room_type_name`), but the push-booking function looks for camelCase keys (`roomTypeId`, `roomTypeName`):

| Source | Format | Example |
|--------|--------|---------|
| Booking data | `room_type_name` | "3 Bedroomed Holiday House" |
| push-booking logic | `roomTypeName` | undefined → falls back to null |
| property_availability | `room_type` | "3 Bedroomed Holiday House" (required) |

When the upsert runs with `room_type: null`, it violates the database constraint and silently fails, leaving dates unblocked.

---

## Solution

### File: `supabase/functions/push-booking/index.ts`

Update the manual property date-blocking logic (lines 165-174) to:

1. **Handle both naming conventions**: Support both `room_type_name` and `roomTypeName` formats
2. **Prioritize room name over ID**: The `property_availability` table uses room names, so match that format
3. **Add fallback logic**: If no room name is found, attempt to look up the room name from property config

### Current Code (line 165-174):

```typescript
for (const room of bookingRooms) {
  availabilityRecords.push({
    property_id: property.id,
    date: dateStr,
    available_units: 0,
    is_stop_sell: true,
    room_type: room.roomTypeId || room.roomTypeName || null,  // BUG: wrong field names
  });
}
```

### Updated Code:

```typescript
for (const room of bookingRooms) {
  // Support both camelCase and snake_case field names
  const roomTypeName = room.roomTypeName || room.room_type_name || 
                       room.roomTypeId || room.room_type_id || null;
  
  if (!roomTypeName) {
    console.warn('Room has no identifiable type - skipping availability block for this room');
    continue;
  }
  
  availabilityRecords.push({
    property_id: property.id,
    date: dateStr,
    available_units: 0,
    is_stop_sell: true,
    room_type: String(roomTypeName),  // Ensure string format
  });
}
```

### Additional Improvement

If the room only has an ID (not a name), look up the room name from the property's wizard configuration:

```typescript
// Before the loop, build a map of room IDs to names from property config
const roomTypeMap = new Map<string, string>();
const amenities = property.amenities as { room_types?: Array<{id: string | number; name: string}> } | null;
if (amenities?.room_types) {
  for (const rt of amenities.room_types) {
    roomTypeMap.set(String(rt.id), rt.name);
  }
}

// In the loop, resolve ID to name if needed
const roomId = room.roomTypeId || room.room_type_id;
const roomName = room.roomTypeName || room.room_type_name || 
                 (roomId ? roomTypeMap.get(String(roomId)) : null);
```

---

## Implementation Steps

1. **Update push-booking edge function**
   - Fix field name handling for both conventions
   - Add room ID to name resolution via property config
   - Add logging for better debugging
   - Ensure room_type is never null

2. **Deploy the updated function**

3. **Verify the fix works**
   - Test a new booking on the manual property
   - Confirm availability records are created with proper room_type
   - Confirm calendar shows dates as blocked

---

## Technical Details

### Files to Modify

- `supabase/functions/push-booking/index.ts` - Lines 148-196 (manual property date blocking section)

### Database Constraint

The `property_availability` table has a NOT NULL constraint on `room_type`, which is correct behavior. The fix ensures we always provide a valid room type name.

### Edge Cases Handled

1. Booking uses camelCase (`roomTypeName`) - handled
2. Booking uses snake_case (`room_type_name`) - handled
3. Booking only has room ID - resolved via property config lookup
4. No room info at all - log warning and skip (better than failing entire booking)
