
# Plan: Enable Calendar to Load Manual Rates for Non-PMS Properties

## Problem Summary

For properties without a PMS (like "Latter Days"), the CalendarAccommodation page shows:
- Empty dashes (—) for rates
- Empty dashes for availability
- No room type or rate type data in the filters

This happens because:
1. When `external_system` is null, `pmsData` is cleared (line 647)
2. The `getRate()` and `getAvailability()` helpers only check `pmsData`
3. No synthetic data is generated from wizard configuration (room_types, seasons, season_rates, pms_rate_types)

## Solution

Generate synthetic PMS-like data for non-PMS properties from the property's wizard configuration, so the existing calendar rendering logic works seamlessly.

## Technical Implementation

### 1. Generate Synthetic PMS Data for Manual Properties

**Location**: `src/pages/CalendarAccommodation.tsx`

Modify the `useEffect` that handles property changes (around line 631-650) to generate synthetic `pmsData` instead of clearing it:

```typescript
useEffect(() => {
  if (!selectedProperty || properties.length === 0) return;
  
  const propertyData = properties.find(p => p.id === selectedProperty);
  if (!propertyData) return;
  
  const isPms = !!propertyData.external_system && propertyData.external_system !== 'none';
  
  if (isPms) {
    fetchPmsAvailability(false);
  } else {
    // Generate synthetic PMS data from wizard configuration
    generateManualPropertyData(propertyData);
  }
}, [selectedProperty, properties, currentDate, viewMode]);
```

### 2. Create generateManualPropertyData Function

Add a new function to generate PMS-compatible data structure from wizard data:

```typescript
const generateManualPropertyData = useCallback(async (property: Property) => {
  setPmsSyncStatus("loading");
  
  const amenities = property.amenities;
  const roomTypes = amenities?.room_types || [];
  const seasons = amenities?.seasons || [];
  const seasonRates = amenities?.season_rates || {}; // Object keyed by roomId
  const pmsRateTypes = amenities?.pms_rate_types || [];
  
  // Generate date range based on current view
  const startDate = new Date(currentDate);
  if (viewMode === "month") {
    startDate.setDate(1);
  }
  const endDate = new Date(startDate);
  if (viewMode === "month") {
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0);
  } else {
    endDate.setDate(endDate.getDate() + 8);
  }
  
  // Fetch manual overrides from property_availability table
  const { data: manualOverrides } = await supabase
    .from("property_availability")
    .select("*")
    .eq("property_id", property.id)
    .gte("date", format(startDate, "yyyy-MM-dd"))
    .lte("date", format(endDate, "yyyy-MM-dd"));
  
  const overridesMap = new Map(
    (manualOverrides || []).map(o => [`${o.room_type}-${o.date}`, o])
  );
  
  // Transform each wizard room type into PMS-compatible format
  const transformedRooms: PMSRoomTypeData[] = roomTypes.map((room: any) => {
    const roomId = room.id?.toString() || room.name;
    const linkedRateTypes = room.linkedRateTypes || [];
    const roomSeasonRates = seasonRates[roomId] || {};
    
    const availabilityByDate: { [date: string]: number } = {};
    const ratesByDate: { [date: string]: any[] } = {};
    const restrictionsByDate: { [date: string]: any } = {};
    
    // Generate data for each date in range
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, "yyyy-MM-dd");
      const override = overridesMap.get(`${room.name}-${dateStr}`);
      
      // Availability: default 99 (unlimited), respect overrides
      if (override?.is_stop_sell) {
        availabilityByDate[dateStr] = 0;
      } else {
        availabilityByDate[dateStr] = override?.available_units ?? 99;
      }
      
      // Restrictions from overrides
      if (override) {
        restrictionsByDate[dateStr] = {
          stopSell: override.is_stop_sell,
          minStay: override.minimum_stay,
          maxStay: override.maximum_stay,
          leadDaysAdvance: override.lead_days_advance,
          leadDaysPost: override.lead_days_post,
        };
      }
      
      // Rates: find applicable season, then look up season rate
      ratesByDate[dateStr] = [];
      
      for (const rateTypeId of linkedRateTypes) {
        const rateType = pmsRateTypes.find((rt: any) => rt.id === rateTypeId);
        const baseRate = rateType?.baseRate || 0;
        
        // Find applicable season for this date
        let rateAmount = baseRate;
        for (const season of seasons) {
          const seasonStart = new Date(season.from || season.startDate);
          const seasonEnd = new Date(season.to || season.endDate);
          if (d >= seasonStart && d <= seasonEnd) {
            // Look up season rate: format is "{roomId}-{rateTypeId}"
            const seasonRateKey = `${roomId}-${rateTypeId}`;
            const seasonRate = roomSeasonRates[seasonRateKey];
            if (seasonRate?.roomAmount) {
              rateAmount = seasonRate.roomAmount;
            }
            break;
          }
        }
        
        ratesByDate[dateStr].push({
          rateTypeId: rateTypeId,
          rateTypeName: rateType?.name || 'Standard Rate',
          priceType: rateType?.priceType || 'UnitRate',
          roomAmount: rateAmount,
        });
      }
    }
    
    return {
      roomTypeId: roomId,
      roomTypeName: room.name || `Room ${roomId}`,
      availabilityByDate,
      ratesByDate,
      restrictionsByDate,
    };
  });
  
  setPmsData({
    roomTypes: transformedRooms,
    lastSynced: new Date(),
    systemType: 'manual',
  });
  setPmsSyncStatus("success");
  setLastSyncTime(new Date());
}, [currentDate, viewMode]);
```

### 3. Update rateTypeOptions for Manual Properties

The `rateTypeOptions` memo already checks `pms_rate_types` from amenities (line 887), but it also checks if rates exist in `pmsData`. With synthetic data now populated, this will work correctly.

### 4. Refresh on View/Date Change for Manual Properties

The synthetic data generation needs to re-run when the date range changes:

```typescript
// Add currentDate and viewMode as dependencies
useEffect(() => {
  if (!selectedProperty || properties.length === 0) return;
  // ... existing logic
}, [selectedProperty, properties, fetchPmsAvailability, currentDate, viewMode]);
```

## Data Flow After Implementation

```text
User opens CalendarAccommodation for "Latter Days"
         ↓
Page detects external_system = null
         ↓
generateManualPropertyData() called:
  1. Reads room_types, seasons, season_rates, pms_rate_types from amenities
  2. Fetches manual overrides from property_availability
  3. For each room, for each date:
     - Sets availability (99 default, 0 if stop-sell)
     - Finds applicable season → looks up season rate
     - Applies restrictions from overrides
  4. Populates pmsData with synthetic PMSRoomTypeData[]
         ↓
Calendar renders normally using existing getRate() / getAvailability() helpers
         ↓
Shows rates: R2,650 per night
Shows availability: 99 (or overridden values)
Shows restrictions: from manual overrides
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/CalendarAccommodation.tsx` | Add `generateManualPropertyData()` function; modify property change effect to call it for non-PMS properties; add date/view dependencies |

## Visual Result

| Current | After |
|---------|-------|
| All cells show "—" | Cells show R2,650 (from season_rates) |
| Availability shows "—" | Shows 99 (default) or blocked dates |
| Room/Rate filters empty | Populated from wizard config |
| "Idle" sync status | "RoomsOnline PMS (Manual Mode)" badge |

## Edge Cases

1. **No seasons defined**: Fall back to `baseRate` from `pms_rate_types`
2. **No linked rate types**: Show "Standard Rate" with base rate from room
3. **Manual overrides exist**: Merge stop-sell and restrictions into synthetic data
4. **Date range change**: Re-generate synthetic data for new range
