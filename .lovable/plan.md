

# Plan: Fix Calendar Start Date, Booking Summary, and Availability Display

## Summary
Three issues remain in the booking flow:
1. **Calendar starts on wrong month**: When opening the date picker on Jan 31st, it shows January instead of February (showing only past dates)
2. **Booking Summary still shows "On request"**: The price isn't being passed correctly from QuickBookDrawer to Booking.tsx
3. **Availability beyond blocked dates not shown**: For manual properties, dates after the blocked period (Feb 9-13) should show as available with rates, but they aren't appearing

---

## Issue 1: Calendar Should Start on Today's Date (Looking Forward)

### Root Cause
In `BottomSheetDatePicker.tsx`, line 47:
```typescript
const [currentMonth, setCurrentMonth] = useState(() => checkIn || new Date());
```

When there's no check-in date selected, it correctly defaults to "today" (`new Date()`). However, the issue is that "today" on Jan 31st results in showing **the January month view**, which only has 1 usable day.

The logic in the `useEffect` (line 52-60) only updates the month when the drawer opens **if a checkIn date already exists**.

### Solution
Modify the initialization logic to always start on the **current month** if showing from today would result in an almost-empty month. Specifically, if today is past the 25th of the month, jump ahead to next month.

**File: `src/components/booking/BottomSheetDatePicker.tsx`**
```typescript
// Line 47 - Smart month initialization
const [currentMonth, setCurrentMonth] = useState(() => {
  const now = new Date();
  // If we're past the 25th, start showing next month
  if (now.getDate() > 25) {
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
  return checkIn || now;
});

// Line 52-60 - Update useEffect to also handle late-month starts
useEffect(() => {
  if (open) {
    setTempCheckIn(checkIn);
    setTempCheckOut(checkOut);
    setSelectingCheckOut(false);
    if (checkIn) {
      setCurrentMonth(checkIn);
    } else {
      // No checkIn selected - start from a sensible month
      const now = new Date();
      if (now.getDate() > 25) {
        setCurrentMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1));
      } else {
        setCurrentMonth(now);
      }
    }
  }
}, [open, checkIn, checkOut]);
```

---

## Issue 2: Booking Summary Shows "On Request" Instead of Price

### Root Cause
The `useEffect` at line 340-385 in `Booking.tsx` only runs when `rooms.length === 0`:
```typescript
if (property && stays.length > 0 && rooms.length === 0) {
```

However, the earlier `useEffect` (lines 232-325) that initializes from URL params or session storage **runs first** and sets `rooms` to a non-empty array. By the time the ItineraryContext effect runs, `rooms.length` is already > 0, so it skips.

The condition is correct for avoiding re-initialization, but it prevents the **price** from being copied from ItineraryContext.

### Solution
Split the initialization: allow price/cost data to be copied from ItineraryContext even when rooms are already initialized, as long as the cost hasn't been calculated yet.

**File: `src/pages/Booking.tsx`**
```typescript
// Replace the condition at line 341 with separate checks:
useEffect(() => {
  if (property && stays.length > 0) {
    const currentStay = stays.find(s => 
      s.property_id === property.id || s.property_slug === property.slug
    );
    
    if (currentStay) {
      // Initialize rooms if not already set
      if (rooms.length === 0) {
        const mappedRooms: RoomBooking[] = currentStay.rooms.map(r => ({
          roomTypeId: r.room_type_id,
          roomTypeName: r.room_type_name,
          numberOfAdults: currentStay.guests.adults,
          numberOfTeens: 0,
          numberOfChildren: currentStay.guests.children,
          numberOfInfants: currentStay.guests.infants,
          numberOfPets: 0,
          checkIn: currentStay.dates.check_in,
          checkOut: currentStay.dates.check_out,
        }));
        setRooms(mappedRooms);
        setCheckIn(currentStay.dates.check_in);
        setCheckOut(currentStay.dates.check_out);
      }
      
      // ALWAYS copy price from context if we don't have it calculated locally
      // This ensures QuickBookDrawer's calculation carries through
      if (currentStay.price_breakdown.total > 0 && totalCost === 0 && costBreakdown.length === 0) {
        console.log('[Booking] Using price from ItineraryContext:', currentStay.price_breakdown.total);
        setTotalCost(currentStay.price_breakdown.total);
        setCostBreakdown(currentStay.rooms.map(r => ({
          description: `${r.room_type_name} (${currentStay.guests.adults + currentStay.guests.children} guest${(currentStay.guests.adults + currentStay.guests.children) !== 1 ? 's' : ''})`,
          nights: currentStay.nights,
          quantity: r.quantity,
          unitPrice: r.rate_per_night,
          total: r.total_price,
        })));
      }
    }
  }
}, [property, stays, rooms.length, totalCost, costBreakdown.length]);
```

---

## Issue 3: Availability Beyond Blocked Dates Not Displayed

### Root Cause
In `QuickBookDrawer.tsx`, the availability fetch for manual properties (lines 150-177) only fetches **existing records** from `property_availability`:
```typescript
const { data } = await supabase
  .from("property_availability")
  .select("date, available_units, is_stop_sell, room_type")
  .eq("property_id", propertyId)
  .gte("date", format(today, "yyyy-MM-dd"))
  .lte("date", format(endDate, "yyyy-MM-dd"));
```

For manual properties, the `property_availability` table likely only has entries for **blocked dates** (stop-sell periods). Dates that are available don't have records - the system should assume availability by default.

The `datePickerAvailability` map (line 384-409) only contains entries from the availability data, so dates without records appear as having **no availability info at all** (null status).

### Solution
For manual properties, synthesize availability for ALL dates in the range. Treat dates without explicit records as **available**, and apply the base rate to them.

**File: `src/components/booking/QuickBookDrawer.tsx`**

Modify the `datePickerAvailability` useMemo to fill in missing dates:
```typescript
// Build availability map for date picker
const datePickerAvailability = useMemo(() => {
  const map = new Map<string, { available: boolean; rate?: number }>();
  
  // For manual properties, get base rate from amenities
  let baseRate: number | undefined;
  if ((!externalSystem || externalSystem === 'none') && propertyAmenities) {
    const roomData = propertyAmenities.room_types?.find((rt: any) => 
      String(rt.id) === String(selectedRoomId) || rt.name === selectedRoom?.name
    );
    const linkedRateTypeId = roomData?.linkedRateTypes?.[0];
    const rateType = propertyAmenities.pms_rate_types?.find((rt: any) => rt.id === linkedRateTypeId);
    baseRate = rateType?.baseRate || roomData?.baseRate;
  }
  
  // For manual properties, synthesize availability for all dates in the next 90 days
  // Dates without explicit records are assumed available
  if ((!externalSystem || externalSystem === 'none') && baseRate) {
    const today = new Date();
    for (let i = 0; i < 90; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dateStr = format(date, "yyyy-MM-dd");
      
      // Check if we have explicit availability data for this date
      const explicitData = availability.get(dateStr);
      
      if (explicitData) {
        // Use explicit data (blocked dates will have available_units = 0)
        map.set(dateStr, {
          available: explicitData.available_units > 0,
          rate: baseRate,
        });
      } else {
        // No explicit data = assume available
        map.set(dateStr, {
          available: true,
          rate: baseRate,
        });
      }
    }
    return map;
  }
  
  // For PMS properties, use the fetched data as-is
  availability.forEach((data, date) => {
    const ratesArray = Array.isArray(data.rates) ? data.rates : data.rates ? [data.rates] : [];
    const pmsRate = ratesArray[0]?.room_amount || ratesArray[0]?.adult_amounts?.adultAmount1;
    
    map.set(date, {
      available: data.available_units > 0,
      rate: pmsRate || baseRate,
    });
  });
  
  return map;
}, [availability, propertyAmenities, externalSystem, selectedRoomId, selectedRoom]);
```

Also update `calculateEstimatedPrice` to use the same assumption (lines 272-300):
```typescript
while (currentDate < checkOut) {
  const dateStr = format(currentDate, "yyyy-MM-dd");
  const availData = availability.get(dateStr);
  
  // For manual properties: no record means available (only blocked dates are stored)
  // Check if date is explicitly blocked
  if (availData && availData.available_units === 0) {
    setEstimatedPrice(null);
    return; // Date is blocked
  }
  
  // ... rest of rate calculation
}
```

---

## Files to Modify

1. **`src/components/booking/BottomSheetDatePicker.tsx`**
   - Smart month initialization (show next month if we're past the 25th)
   - Update useEffect to apply the same logic when drawer opens

2. **`src/pages/Booking.tsx`**
   - Fix the ItineraryContext effect to copy price even when rooms are already initialized

3. **`src/components/booking/QuickBookDrawer.tsx`**
   - Synthesize availability for all 90 days for manual properties
   - Fix price calculation to not fail on dates without explicit availability records

---

## Technical Notes

### Why Manual Properties Have Sparse Availability Data
For properties without a PMS (`external_system: 'none'`), RoomsOnline only stores **blocked dates** (stop-sell) in `property_availability`. This is an optimization - instead of storing 365 "available" records per year, only blocked periods are recorded.

The fix treats "no record" as "available" for manual properties, which aligns with the data model.

### Testing Checklist
- Open date picker on Jan 31 - should show February
- Select dates for Latter Days property
- Verify rate (R2,650/night) shows in calendar cells (desktop)
- Verify dates after Feb 13 are selectable and show green availability
- Confirm price carries through to booking summary (not "On request")

