
# Fix Hostfully Rates Display on PropertyShowcase Page

## Problem Identified

The **PropertyShowcase** page (which lists all rooms for a property) doesn't fetch or display rates for Hostfully properties. Looking at your screenshot, the "Full Property" room shows:
- "Min Stay 2 nights0" (availability is partially working but has a display bug)
- "per-unit" badge shows (rate type is detected)
- **No price displayed** (rates aren't being fetched)

### Root Cause

PropertyShowcase.tsx currently only handles HotelBeds for live availability fetching:

```typescript
// Line 260 - only HotelBeds detection
const isHotelBedsProperty = property?.external_system === "hotelbeds";

// Line 278-282 - only triggers for HotelBeds
useEffect(() => {
  if (isHotelBedsProperty && property?.id) {
    fetchHotelBedsAvailability();
  }
}, [property?.id, isHotelBedsProperty]);

// Line 307 - doesn't include availability_per_night
const availabilityArray = rt.rooms_available_per_night || rt.daily_availability || [];
```

Hostfully is completely missing from this flow.

## Solution

Update `PropertyShowcase.tsx` to add Hostfully support, mirroring the HotelBeds implementation:

### Part 1: Add Hostfully Property Detection

```typescript
// After line 260
const isHostfullyProperty = property?.external_system === "hostfully";
```

### Part 2: Rename and Generalize the Fetch Function

Rename `fetchHotelBedsAvailability` to `fetchLivePMSAvailability` and make it PMS-agnostic:

```typescript
const fetchLivePMSAvailability = async () => {
  if (!property?.id) return;
  
  // Determine which API to use
  const apiName = isHostfullyProperty ? 'hostfully-api' : 'hotelbeds-api';
  
  const today = new Date().toISOString().split('T')[0];
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 14);
  const end = endDate.toISOString().split('T')[0];

  try {
    const { data, error } = await supabase.functions.invoke(apiName, {
      body: {
        action: 'fetch_availability',
        property_id: property.id,
        start_date: today,
        end_date: end,
      }
    });
    
    if (data?.success && data?.data?.room_types) {
      const availMap = new Map<string, AvailabilityData>();
      data.data.room_types.forEach((rt: any) => {
        const roomId = rt.room_type_id || rt.id;
        // Include availability_per_night for Hostfully
        const availabilityArray = rt.rooms_available_per_night || 
                                  rt.daily_availability || 
                                  rt.availability_per_night || [];
        const todayData = availabilityArray.find((d: any) => d.date === today) || availabilityArray[0];
        
        availMap.set(roomId, {
          external_room_type_id: roomId,
          available_units: todayData?.available_units ?? 1,
          rates: rt.rate_types || [],
          date: todayData?.date || today,
        });
      });
      setAvailability(availMap);
    }
  } catch (error) {
    console.error(`Failed to fetch ${apiName} availability:`, error);
  }
};
```

### Part 3: Update the useEffect Trigger

```typescript
useEffect(() => {
  if ((isHotelBedsProperty || isHostfullyProperty) && property?.id) {
    fetchLivePMSAvailability();
  }
}, [property?.id, isHotelBedsProperty, isHostfullyProperty]);
```

### Part 4: Add Hostfully to FloatingDateGuestPicker Condition

Currently at line 519, only Benson and HotelBeds show the floating picker. Add Hostfully:

```typescript
{(isBensonProperty || isHotelBedsProperty || isHostfullyProperty) && (
  <FloatingDateGuestPicker onContinue={scrollToRooms} ctaLabel="Check Rates" />
)}
```

## Technical Details

### Data Flow After Fix

```text
PropertyShowcase loads Hostfully property
            │
            ▼
useEffect triggers fetchLivePMSAvailability()
            │
            ▼
┌───────────────────────────────────────────────────────┐
│ supabase.functions.invoke('hostfully-api', {          │
│   action: 'fetch_availability',                       │
│   property_id: property.id,                           │
│   start_date: today,                                  │
│   end_date: +14 days                                  │
│ })                                                    │
└───────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────┐
│ Response:                                             │
│ { room_types: [{                                      │
│     room_type_id: "818e799c...",                      │
│     availability_per_night: [...],  ← Now extracted! │
│     rate_types: [{ rates: [{ room_amount: 450 }] }]   │
│ }]}                                                   │
└───────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────┐
│ setAvailability(availMap) populated with:             │
│   - available_units                                   │
│   - rates (rate_types array)                          │
└───────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────────────────────────────────────┐
│ getLowestRateForRoom() extracts:                      │
│   rateType.rates[0].room_amount = 450                 │
│                                                       │
│ UI displays: "R450/night"                             │
└───────────────────────────────────────────────────────┘
```

### Bonus Fix: Min Stay Display Bug

The screenshot shows "Min Stay 2 nights0" - there's an extra "0" being appended. This is likely a concatenation bug in the RoomCollection component or PropertyShowcase that should be investigated separately.

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Add `isHostfullyProperty` check, rename fetch function, add `availability_per_night` extraction, update useEffect trigger, add Hostfully to FloatingDateGuestPicker condition |

## Expected Result

After this fix:
1. Hostfully properties on `/property/:slug` will fetch live availability and rates
2. RoomCollection will display "R450/night" (or actual rate) for each room card
3. The FloatingDateGuestPicker will appear for Hostfully properties
4. Backward compatibility with HotelBeds and Benson is maintained
