

# Complete Fix for Hostfully Booking Flow

## Problems Identified

After thorough investigation, I found **4 interconnected issues** preventing the Hostfully booking flow from working:

| Issue | Component | Problem |
|-------|-----------|---------|
| 1 | RoomShowcase | `getLowestRate()` doesn't check `room.dailyRate` (Hostfully's cached rate field) |
| 2 | RoomAvailabilityCalendar | Fetches from `pms_availability_cache` which is empty for Hostfully - no live fetch |
| 3 | hostfully-api Edge Function | Doesn't write availability data to `pms_availability_cache` like other adapters |
| 4 | Live rate matching | Room matching doesn't check `hostfullyId` field |

## Solution Overview

### Part 1: Update `getLowestRate()` in RoomShowcase.tsx

Add a check for `room.dailyRate` as the **first** fallback after live rates:

```typescript
const getLowestRate = (): number | null => {
  // 1. First check live rates (real-time from API)
  if (liveRates.length > 0) {
    // ... existing live rate extraction logic
  }
  
  // 2. NEW: Check room.dailyRate (Hostfully cached rate from sync)
  if (room.dailyRate && typeof room.dailyRate === 'number' && room.dailyRate > 0) {
    return room.dailyRate;
  }
  
  // 3. Then check pms_rates from room data
  // ... existing logic
};
```

### Part 2: Update Room Matching to Include `hostfullyId`

In `fetchLiveRates()`, update the matching logic:

```typescript
const roomId = room.pmsRoomId || room.hostfullyId || room.id;
const matchedRoom = data.data.room_types.find((rt: any) => 
  (rt.room_type_id || rt.id) === roomId || 
  rt.name === room.name
);
```

### Part 3: Update RoomAvailabilityCalendar for Hostfully Live Fetch

Add logic to fetch live availability for Hostfully properties instead of only relying on cache:

```typescript
const fetchAvailability = async () => {
  setLoading(true);
  try {
    // For Hostfully: fetch live instead of from cache
    if (externalSystem === 'hostfully') {
      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: {
          action: 'fetch_availability',
          property_id: propertyId,
          start_date: format(startOfMonth(displayedMonth), "yyyy-MM-dd"),
          end_date: format(endOfMonth(addMonths(displayedMonth, 2)), "yyyy-MM-dd"),
        }
      });
      
      if (!error && data?.success && data?.data?.room_types) {
        // Transform live data to availability map format
        const matchedRoom = data.data.room_types.find((rt: any) => 
          rt.room_type_id === roomId || rt.name === roomName
        );
        
        if (matchedRoom) {
          const availMap = new Map<string, AvailabilityData>();
          const availArray = matchedRoom.availability_per_night || [];
          const rateTypes = matchedRoom.rate_types || [];
          
          availArray.forEach((item: any) => {
            // Find matching rate for this date
            const ratesForDate = rateTypes.flatMap((rt: any) => 
              (rt.rates || []).filter((r: any) => r.date === item.date)
            );
            
            availMap.set(item.date, {
              date: item.date,
              available_units: item.available_units,
              rates: ratesForDate,
              restrictions: item.restrictions,
            });
          });
          
          setAvailability(availMap);
        }
      }
      setLoading(false);
      return;
    }
    
    // Existing cache-based fetch for other PMS systems
    // ... existing code
  }
};
```

### Part 4: Update hostfully-api to Cache Availability (Optional Background Sync)

Add caching logic to `handleFetchAvailability` in `hostfully-api/index.ts`, similar to HotelBeds:

```typescript
// After transforming availability, cache it
if (propertyId) {
  for (const roomType of availability.room_types) {
    for (const availDay of (roomType.availability_per_night || [])) {
      // Find matching rates for this date
      const ratesForDate = roomType.rate_types?.flatMap(rt => 
        (rt.rates || []).filter(r => r.date === availDay.date)
      ) || [];
      
      await supabase.from("pms_availability_cache").upsert({
        property_id: propertyId,
        system_type: "hostfully",
        external_room_type_id: roomType.room_type_id,
        date: availDay.date,
        available_units: availDay.available_units,
        restrictions: availDay.restrictions,
        rates: ratesForDate,
        raw_data: { roomTypeName: roomType.name },
        fetched_at: new Date().toISOString(),
      }, {
        onConflict: 'property_id,external_room_type_id,date,system_type',
      });
    }
  }
}
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/RoomShowcase.tsx` | 1. Add `room.dailyRate` fallback in `getLowestRate()` 2. Add `hostfullyId` to room matching in `fetchLiveRates()` |
| `src/components/RoomAvailabilityCalendar.tsx` | Add live fetch branch for Hostfully properties at start of `fetchAvailability()` |
| `supabase/functions/hostfully-api/index.ts` | Add caching logic to `handleFetchAvailability()` to populate `pms_availability_cache` |

## Expected Results After Fix

1. **RoomShowcase** - Rates display using either live API data OR cached `dailyRate` field
2. **RoomAvailabilityCalendar** - Calendar shows real availability by fetching live from Hostfully API
3. **Booking.tsx** - Cost calculation works with live Hostfully data
4. **push-booking** - Booking submission creates lead in Hostfully (already implemented)

## Technical Flow After Fix

```text
User visits /property/:slug/room/:roomSlug (Hostfully)
              |
              v
RoomShowcase loads -> fetchLiveRates() called
              |
              v
hostfully-api returns rates -> setLiveRates()
              |
              v
getLowestRate() extracts rate from liveRates OR dailyRate
              |
              v
User clicks "Check Availability" -> navigates to calendar
              |
              v
RoomAvailabilityCalendar -> fetchAvailability() calls hostfully-api LIVE
              |
              v
Calendar displays dates with real pricing
              |
              v
User selects dates -> "Proceed to Booking"
              |
              v
Booking.tsx -> calculateCost() fetches from hostfully-api
              |
              v
Submit booking -> push-booking creates Hostfully lead
```

