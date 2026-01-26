
# Fix Hostfully Property Display on Public Booking Page

## Problem Identified

The RoomShowcase page (which displays individual rooms for booking) shows no rates or availability for Hostfully properties because:

1. **Missing Hostfully detection**: There's no `isHostfullyProperty` check
2. **No live rate fetching**: Unlike HotelBeds, Hostfully doesn't have a `fetchLiveRates()` call
3. **No availability calendar navigation**: Hostfully isn't included in the booking flow routing

### Current State

| PMS | Detection | Live Rates | Availability Calendar |
|-----|-----------|------------|----------------------|
| NightsBridge | `isNightsBridgeProperty` | External iframe | N/A |
| Benson | `isBensonProperty` | Via cache | Navigates to `/availability` |
| HotelBeds | `isHotelBedsProperty` | `fetchLiveRates()` | Navigates to `/availability` |
| Hostfully | NOT DETECTED | No fetching | No navigation |

## Solution

Update `RoomShowcase.tsx` to add full Hostfully support mirroring the HotelBeds implementation:

### Part 1: Add Hostfully Property Detection

Add an `isHostfullyProperty` check alongside the existing PMS checks.

**Location**: After line 257

```typescript
// Check if this is a Hostfully property
const isHostfullyProperty = property?.external_system === "hostfully";
```

### Part 2: Fetch Live Rates for Hostfully

Modify the `fetchLiveRates` function to also handle Hostfully, calling the `hostfully-api` edge function with `fetch_availability` action.

**Key changes**:
- Extend the condition to include Hostfully
- Add Hostfully-specific API invocation
- Handle the response format (which matches the adapter contract we already fixed)

### Part 3: Update Availability Calendar Navigation

Add Hostfully to the condition in `handleCheckAvailability` so users can navigate to the room availability page.

**Location**: Line 340

```typescript
// For Benson, HotelBeds, or Hostfully properties: navigate to availability calendar
if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty) && property && room) {
```

### Part 4: Trigger Live Rate Fetch for Hostfully

Update the useEffect that triggers `fetchLiveRates` to include Hostfully.

**Location**: After line 316

```typescript
useEffect(() => {
  if ((isHotelBedsProperty || isHostfullyProperty) && property?.id && room && !fetchingLiveRates && liveRates.length === 0) {
    fetchLiveRates();
  }
}, [property?.id, room, isHotelBedsProperty, isHostfullyProperty]);
```

## Technical Details

### Edge Function Parameters for Hostfully

The `hostfully-api` edge function expects:
```typescript
{
  action: "fetch_availability",
  property_id: property.id,  // ROL property UUID
  start_date: "YYYY-MM-DD",
  end_date: "YYYY-MM-DD"
}
```

### Response Handling

The response follows the adapter contract we already fixed:
```json
{
  "success": true,
  "data": {
    "room_types": [{
      "room_type_id": "...",
      "name": "Full Property",
      "availability_per_night": [...],
      "rate_types": [{
        "rate_type_id": "per-unit",
        "name": "Per Unit Rate",
        "rates": [...]
      }]
    }]
  }
}
```

The existing `fetchLiveRates` response parsing will work because it already handles:
- `data?.data?.room_types` - matches our structure
- `rate_types` - already extracted
- `rooms_available_per_night` - needs fallback to `availability_per_night`

### Additional Fallback for Availability Field

The availability extraction in `fetchLiveRates` needs to include `availability_per_night`:

```typescript
const availArray = matchedRoom.rooms_available_per_night || 
                   matchedRoom.dailyAvailability || 
                   matchedRoom.availability_per_night || [];  // Added
```

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/RoomShowcase.tsx` | Add `isHostfullyProperty` check, extend `fetchLiveRates` for Hostfully, update navigation and trigger conditions |

## Expected Result

After this fix:
1. Hostfully properties will show "R450/night" rates on the room showcase page
2. Availability data will display correctly
3. "Check Availability" button will navigate to the room availability calendar
4. Live rates will be fetched from the Hostfully API on page load
