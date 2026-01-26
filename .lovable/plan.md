

# Fix Hostfully Calendar Data Display - Room Name Mismatch

## Problem Identified

The calendar sync succeeds and data is correctly fetched from Hostfully, but **nothing displays** because of a room name mismatch in the filtering logic.

### Root Cause Analysis

The data flow has a mismatch between room names:

```text
Edge Function (hostfully-api)             Frontend (CalendarAccommodation.tsx)
┌─────────────────────────────────────┐   ┌───────────────────────────────────────┐
│ mapHostfullyCalendarToAvailability  │   │ fetchRoomTypes() reads from:          │
│                                     │   │   amenities.room_types[0].name        │
│ Returns:                            │   │   = "Full Property"                   │
│   name: "Property" ← HARDCODED!     │   │                                       │
└─────────────────────────────────────┘   │ Sets selectedRoomTypes = ["Full..."]  │
        │                                 └───────────────────────────────────────┘
        ▼                                             │
┌─────────────────────────────────────┐               ▼
│ calendarRoomData built with:        │   ┌───────────────────────────────────────┐
│   name: pmsRoom.roomTypeName        │   │ Filter: selectedRoomTypes.includes(   │
│       = "Property"                  │   │           room.name)                  │
└─────────────────────────────────────┘   │                                       │
        │                                 │ "Full Property".includes("Property")  │
        └────────────────────────────────▶│       = FALSE ← MISMATCH!             │
                                          └───────────────────────────────────────┘
                                                      │
                                                      ▼
                                          ┌───────────────────────────────────────┐
                                          │ filteredRooms = []                    │
                                          │ Calendar displays EMPTY               │
                                          └───────────────────────────────────────┘
```

### Database State

| Field | Value |
|-------|-------|
| `amenities.room_types[0].name` | "Full Property" |
| `amenities.room_types[0].hostfullyId` | "818e799c-df32-4d53-8765-dd8b7e2b0ff0" |
| Edge function `room_type_id` | "818e799c-df32-4d53-8765-dd8b7e2b0ff0" |
| Edge function `name` | "Property" (hardcoded) |

## Solution

Fix the edge function to look up the actual room name from the database instead of hardcoding it. For Hostfully whole-property rentals, the "room" is the entire property - we need to query for the ingested room name.

### Part 1: Update Edge Function to Fetch Room Name

Modify `handleFetchAvailability` in `supabase/functions/hostfully-api/index.ts` to:

1. Query the `hostfully_room_types` table using `hostfully_uid` to get the actual room name
2. Pass this name to `mapHostfullyCalendarToAvailability` 
3. Fall back to "Property" if no match found

**Current Code (lines 376-379):**
```typescript
function mapHostfullyCalendarToAvailability(calendarData: HostfullyCalendarDay[], propertyUid: string) {
  const roomType = {
    room_type_id: propertyUid,
    name: "Property",  // ← HARDCODED
```

**Fixed Approach:**

1. In `handleFetchAvailability`, before calling the mapper, look up the room name:
```typescript
// Query hostfully_room_types to get actual room name
const { data: roomData } = await supabaseClient
  .from('hostfully_room_types')
  .select('name')
  .eq('hostfully_uid', propertyUid)
  .maybeSingle();

const roomName = roomData?.name || 'Property';
const availability = mapHostfullyCalendarToAvailability(calendarArray, propertyUid, roomName);
```

2. Update the mapper signature to accept room name:
```typescript
function mapHostfullyCalendarToAvailability(
  calendarData: HostfullyCalendarDay[], 
  propertyUid: string, 
  roomName: string = "Property"
) {
  const roomType = {
    room_type_id: propertyUid,
    name: roomName,  // ← Now dynamic
    // ...
  };
}
```

## Technical Details

### Query for Room Name

The `hostfully_room_types` table contains:
- `hostfully_uid`: The Hostfully property UID (matches `propertyUid` parameter)  
- `name`: The actual room name (e.g., "Full Property")

### Fallback Logic

If no matching room is found in the database (e.g., property not fully ingested), fall back to "Property" as before.

### Alternative Frontend Fix (Not Recommended)

An alternative would be to update `selectedRoomTypes` based on `pmsData.roomTypes` when PMS data loads, but this creates a more complex dependency chain. Fixing at the source (edge function) is cleaner.

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/index.ts` | Query `hostfully_room_types` for actual room name and pass to mapper |

## Expected Result After Fix

```text
Edge function returns:
  room_types[0].name = "Full Property" ← Matches database

selectedRoomTypes = ["Full Property"]
calendarRoomData[0].name = "Full Property"

Filter: ["Full Property"].includes("Full Property") = TRUE ✓

Calendar displays:
  - R450/night rates
  - Availability data
  - Min stay restrictions
```

