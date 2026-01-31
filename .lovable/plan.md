
# Plan: Enable Calendar Booking for Non-PMS Properties

## Problem Summary

For properties without a PMS connection (like "Latter Days"), the calendar on the `/property/:slug/room/:roomSlug/availability` page shows all dates as unavailable (red). This is because:

1. The calendar fetches availability from `pms_availability_cache` or PMS APIs
2. Non-PMS properties have no data in either source
3. The `isDateAvailable()` check returns false when no data exists
4. All future dates appear locked/unavailable

## Solution

Modify `RoomAvailabilityCalendar.tsx` to detect when there's no PMS (`externalSystem` is null/undefined/'none') and generate synthetic availability using wizard rates from the property's `amenities.room_types`.

## Technical Changes

### 1. RoomAvailabilityCalendar.tsx - Generate Synthetic Availability

**Location**: `src/components/RoomAvailabilityCalendar.tsx`

**Add property data fetch to get wizard rates:**
```typescript
// Add state for property amenities
const [propertyAmenities, setPropertyAmenities] = useState<any>(null);

// In fetchRoomTypeData, also store amenities
const fetchRoomTypeData = async () => {
  // ... existing code to get propertyData
  if (propertyData?.amenities) {
    setPropertyAmenities(propertyData.amenities);
  }
};
```

**Modify fetchAvailability to handle non-PMS properties:**
```typescript
const fetchAvailability = async () => {
  setLoading(true);
  try {
    const monthStart = format(startOfMonth(displayedMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(addMonths(displayedMonth, 2)), "yyyy-MM-dd");

    // NEW: For properties without external system, generate synthetic availability
    if (!externalSystem || externalSystem === 'none') {
      const wizardRooms = propertyAmenities?.room_types || [];
      const matchedRoom = wizardRooms.find((r: any) => 
        String(r.id) === String(roomId) || 
        String(r.pmsRoomId) === String(roomId) ||
        r.name === roomName
      );
      
      const baseRate = matchedRoom?.base_rate || matchedRoom?.baseRate || matchedRoom?.daily_rate;
      const rateUnit = matchedRoom?.rate_unit || matchedRoom?.rateUnit || 'per_night';
      const seasons = propertyAmenities?.seasons || [];
      
      const availMap = new Map<string, AvailabilityData>();
      const startDate = new Date(monthStart);
      const endDate = new Date(monthEnd);
      
      // Generate availability for each day in range
      for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateStr = format(d, "yyyy-MM-dd");
        const seasonRate = findSeasonRate(dateStr, seasons, propertyAmenities?.season_rates);
        const rateForDay = seasonRate?.roomAmount || baseRate;
        
        availMap.set(dateStr, {
          date: dateStr,
          available_units: 99, // Unlimited availability for manual properties
          rates: rateForDay ? [{
            rate_type_id: 'wizard-rate',
            rate_type_name: 'Standard Rate',
            room_amount: rateForDay,
            price_type: rateUnit === 'per_stay' ? 'PerStay' : 'UnitRate',
          }] : undefined,
        });
      }
      
      setAvailability(availMap);
      setLoading(false);
      return;
    }

    // ... existing PMS fetch code
  }
};
```

**Add helper function for seasonal rates:**
```typescript
// Find applicable season rate for a given date
const findSeasonRate = (dateStr: string, seasons: any[], seasonRates: any[]) => {
  if (!seasons?.length || !seasonRates?.length) return null;
  
  const date = new Date(dateStr);
  for (const season of seasons) {
    const start = new Date(season.startDate || season.start_date);
    const end = new Date(season.endDate || season.end_date);
    if (date >= start && date <= end) {
      // Find rate for this season
      const rate = seasonRates?.find((sr: any) => 
        sr.seasonId === season.id || sr.season_id === season.id
      );
      if (rate?.roomAmount || rate?.room_amount) {
        return { roomAmount: rate.roomAmount || rate.room_amount };
      }
    }
  }
  return null;
};
```

### 2. Update Modifiers for Non-PMS Properties

When synthetic availability is generated, all dates should show as "available" (green), not "no data" (red):

```typescript
modifiers={{
  available: (date) => !isBefore(date, startOfDay(new Date())) && isDateAvailable(date),
  unavailable: (date) => !isBefore(date, startOfDay(new Date())) && availability.has(format(date, "yyyy-MM-dd")) && !isDateAvailable(date),
  // nodata only applies when we actually DON'T have synthetic availability
  nodata: (date) => !isBefore(date, startOfDay(new Date())) && !availability.has(format(date, "yyyy-MM-dd")),
}}
```

Since synthetic availability populates the map for all dates in range, `nodata` will never apply for non-PMS properties - all future dates will show as `available` (green).

### 3. Update isDateAvailable Logic

The existing logic already works correctly - once synthetic data is in the map with `available_units: 99`, dates will be considered available.

## Visual Result

| Before | After |
|--------|-------|
| All dates show red/locked | All dates show green/bookable |
| "No availability data" tooltip | Shows wizard rate in tooltip |
| Cannot select dates | Full date selection enabled |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/RoomAvailabilityCalendar.tsx` | Add synthetic availability generation for non-PMS properties using wizard rates |

## Flow After Implementation

```text
User visits /property/latter-days/room/[room]/availability
         ↓
RoomAvailabilityCalendar detects externalSystem = null
         ↓
Fetches propertyAmenities with room_types + seasons
         ↓
Generates synthetic availability for next 3 months:
  • available_units: 99 (always available)
  • rates: from wizard base_rate + seasonal adjustments
         ↓
Calendar displays all dates as green/bookable
         ↓
Guest selects dates → proceeds to checkout
         ↓
Booking.tsx uses same wizard rates for cost calculation
