
# Plan: Fix Latter Days Booking Flow - Rate Display, Calendar UX, and Streamlined Checkout

## Problem Summary

Testing the "Latter Days" property reveals several UX and functional issues:

1. **Room cards show "Contact for rates"** instead of R2,650/night (the actual rate)
2. **Calendar appears cluttered** with duplicate date selection UI (quick dates bar + full calendar grid)
3. **Blocked/unavailable dates not clearly distinguished** - small dots instead of greyed-out cells
4. **"Add to Journey" and "Book Now" buttons don't work** when clicked
5. **Flow requires excessive scrolling** before actions become available

---

## Root Cause Analysis

### 1. Rate Display Failure

The `getLowestRateForRoom()` function in `PropertyShowcase.tsx` fails to find rates because of ID mismatches:

- **Room data**: `{ id: "1", name: "3 Bedroomed Holiday House" }`
- **pms_availability_cache**: Uses `external_room_type_id: "holiday-house"` (old slug)
- **Synthetic availability map**: Built with key `"wizard-room-3 Bedroomed Holiday House"` instead of using room's actual `id`

The base rate (R2,650) is stored in `amenities.pms_rate_types[0].baseRate` but the room lookup fails before reaching the fallback logic.

### 2. Button Click Failures

For AI Concierge-enabled manual properties:
- `StickyBookingCTA` shows "Add to Journey" but `handleBookProperty()` expects booked rooms OR scrolls to rooms section
- `AIConciergePanel` requires a query before showing suggestions - clicking the collapsed orb opens chat, not a direct date picker
- No direct path from date selection to room addition without scrolling or chatting

### 3. Calendar UX Issues

- `BottomSheetDatePicker` shows quick-date row (21 days) AND full calendar grid
- Past/disabled dates only show `opacity-30`, not clearly greyed out
- Blocked dates (`is_stop_sell: true`) show a tiny red dot but cell isn't visually blocked

---

## Technical Fix Plan

### Phase 1: Fix Rate Retrieval for Manual Properties

**File: `src/pages/PropertyShowcase.tsx`**

Update the synthetic availability map building (lines 313-336):

```typescript
// BEFORE: Uses "wizard-room-{name}" as key
const roomId = room.id || room.room_type_id || `wizard-room-${room.name}`;

// AFTER: Use the actual room ID from amenities data
const roomId = room.id || room.room_type_id;
// Also add an alias by slugified name for lookup flexibility
```

Update `getLowestRateForRoom()` (lines 556-614) to:
1. First check direct room `base_rate`/`baseRate` from wizard data
2. Look up linked rate type in `pms_rate_types` for actual configured rate
3. Fall back to availability cache only if above fails

```typescript
const getLowestRateForRoom = (room: RoomType): number | null => {
  // 1. Direct wizard rate from room_types
  const roomAny = room as any;
  if (roomAny.baseRate || roomAny.base_rate || roomAny.daily_rate) {
    return roomAny.baseRate || roomAny.base_rate || roomAny.daily_rate;
  }
  
  // 2. Linked rate type lookup
  const linkedRateTypes = roomAny.linkedRateTypes || [];
  const pmsRateTypes = property?.amenities?.pms_rate_types || [];
  for (const rateTypeId of linkedRateTypes) {
    const rateType = pmsRateTypes.find((rt: any) => rt.id === rateTypeId);
    if (rateType?.baseRate) {
      return rateType.baseRate;
    }
  }
  
  // 3. Existing availability cache lookup (keep as fallback)
  // ... existing code ...
};
```

### Phase 2: Fix Button Actions

**File: `src/pages/PropertyShowcase.tsx`**

Update `handleBookProperty()` to work for AI Concierge mode:

```typescript
const handleBookProperty = () => {
  // If AI Concierge is enabled, open the date picker directly for streamlined booking
  if (aiConciergeEnabled && !aiFailed && isManualRatesProperty) {
    // Scroll to rooms section AND expand the concierge panel
    scrollToRooms();
    return;
  }
  // ... existing logic ...
};
```

**File: `src/components/showcase/StickyBookingCTA.tsx`**

For single-room properties, the CTA should open a quick booking flow:

```typescript
// When property has only 1 room type, bypass "Explore Rooms" and go directly to selection
if (scrollContext === 'rooms' && roomCount === 1) {
  return (
    <>
      <Calendar className="mr-2 h-4 w-4" />
      Select Dates
    </>
  );
}
```

### Phase 3: Improve Calendar Clarity

**File: `src/components/booking/BottomSheetDatePicker.tsx`**

1. **Make blocked dates obviously disabled**:

```typescript
// Lines 300-336: Update cell styling
className={cn(
  "h-11 rounded-xl text-sm font-medium transition-all duration-200",
  // Blocked/unavailable dates - clearly greyed out
  status && !status.available && "bg-muted/70 text-muted-foreground/50 cursor-not-allowed line-through",
  // Past dates - also clearly disabled
  disabled && "bg-muted/50 text-muted-foreground/30 cursor-not-allowed",
  // ... rest of styles
)}
```

2. **Add clear visual legend** below the calendar:

```typescript
// After the calendar grid, before the summary
<div className="px-4 py-2 text-xs flex items-center justify-center gap-4 text-muted-foreground">
  <span className="flex items-center gap-1">
    <span className="w-2 h-2 rounded-full bg-green-500" />
    Available
  </span>
  <span className="flex items-center gap-1">
    <span className="w-2 h-2 rounded-full bg-red-400" />
    Unavailable
  </span>
</div>
```

3. **Prevent selecting blocked date ranges**:

```typescript
const handleDateClick = (date: Date) => {
  if (isBefore(date, startOfDay(minDate))) return;
  
  // NEW: Prevent selecting blocked dates
  const status = getDateStatus(date);
  if (status && !status.available) return;
  
  // ... rest of logic
};
```

### Phase 4: Streamline Mobile Booking Flow

**File: `src/components/booking/AIConciergePanel.tsx`**

Add a "Quick Book" mode that shows date picker immediately:

```typescript
// On mobile, show the date selection buttons prominently
// Update collapsed pill (lines 567-593)
<motion.div className="flex flex-col items-center gap-2">
  {/* Primary action: Select Dates */}
  <button
    onClick={() => setDatePickerOpen(true)}
    className="flex items-center gap-2 px-6 py-3 rounded-full bg-primary text-primary-foreground shadow-lg"
  >
    <Calendar className="h-5 w-5" />
    <span className="font-medium">Select Dates to Book</span>
  </button>
  
  {/* Secondary: AI Chat */}
  <button
    onClick={() => setIsExpanded(true)}
    className="text-xs text-muted-foreground"
  >
    or ask the concierge
  </button>
</motion.div>
```

### Phase 5: Auto-Add Room for Single-Room Properties

**File: `src/components/booking/AIConciergePanel.tsx`**

When dates are confirmed for a single-room property, automatically add to cart:

```typescript
const handleDatesChange = (checkIn: Date, checkOut: Date) => {
  setDates(format(checkIn, 'yyyy-MM-dd'), format(checkOut, 'yyyy-MM-dd'));
  
  // For single-room properties, auto-add to journey after date selection
  if (roomTypes.length === 1) {
    const room = roomTypes[0];
    const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
    
    // Get rate from room data
    const roomRate = room.baseRate || room.base_rate || room.daily_rate || 0;
    const totalPrice = roomRate * nights;
    
    addStay({
      property_id: propertyId,
      property_name: propertyName,
      property_slug: propertySlug,
      property_image: propertyImage || '',
      external_system: externalSystem || 'none',
      dates: {
        check_in: format(checkIn, 'yyyy-MM-dd'),
        check_out: format(checkOut, 'yyyy-MM-dd'),
      },
      rooms: [{
        room_type_id: room.id,
        room_type_name: room.name,
        quantity: 1,
        rate_per_night: roomRate,
        total_price: totalPrice,
      }],
      guests: {
        adults: firstRoom.numberOfAdults || 2,
        children: firstRoom.numberOfChildren || 0,
        infants: firstRoom.numberOfInfants || 0,
      },
      price_breakdown: {
        subtotal: totalPrice,
        fees: [],
        taxes: [],
        total: totalPrice,
      },
      availability_status: 'available',
      nights,
    });
    
    toast.success(`Added ${room.name} to your journey!`);
  }
};
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Fix `getLowestRateForRoom()` to check wizard rates first; Update synthetic availability map keys |
| `src/components/booking/BottomSheetDatePicker.tsx` | Grey out blocked dates clearly; Add legend; Prevent blocked date selection |
| `src/components/booking/AIConciergePanel.tsx` | Prioritize date picker in collapsed state; Auto-add single-room properties |
| `src/components/showcase/StickyBookingCTA.tsx` | Pass room count; Update CTA text for single-room properties |
| `src/components/showcase/RoomCollection.tsx` | No changes needed (receives rates from parent) |

---

## Expected Outcome

After implementation:

1. **Room card shows "From R2,650/night"** correctly
2. **Calendar clearly shows**: available (normal), unavailable (greyed out + line-through), past (faded)
3. **Date selection flow**: Tap dates -> Calendar opens -> Select range -> Auto-adds room for single-room property -> SmartCart appears
4. **Book Now button works**: Opens checkout when cart has items
5. **No excessive scrolling**: Key actions available from the first screen

---

## Testing Checklist

- Visit `/property/latter-days`
- Verify room card shows rate (R2,650)
- Open date picker from floating button
- Verify blocked dates (Feb 9-13) appear greyed out
- Select available dates (Feb 2-7)
- Verify room auto-added to cart (single-room property)
- Click Checkout on SmartCart
- Complete payment flow
