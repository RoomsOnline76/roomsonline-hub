
# Plan: Fix "Book Now" Button, Room Details Booking, and Travel Concierge Flow

## Issues Identified

### Issue 1: "Book Now" Button Below Map Not Working
**Root Cause:** The `InvitationMap` component's `onBookNow` prop calls `handleBookProperty()` in PropertyShowcase. However, for properties where AI Concierge is enabled (which hides `StickyBookingCTA`), the `handleBookProperty()` function tries to open `quickBookDrawerOpen` for single-room properties, but this drawer may not be visible or functioning correctly when AI Concierge is the active booking interface.

**Solution:** Update `handleBookProperty()` to integrate with the AI Concierge flow:
- If AI Concierge is active, open the date picker via the MobileBookingContext or trigger the booking strip
- For single-room properties with dates selected, directly add to cart using `addStay`

### Issue 2: Room Details Page Shows No Price & Can't Book
**Root Cause:** In `RoomShowcase.tsx`, the `handleCheckAvailability()` function only handles:
1. NightsBridge (external booking)
2. Benson/HotelBeds/Hostfully (navigates to availability calendar)
3. Non-PMS properties (just goes back to property page)

For **manual rates properties** (external_system: 'none'), there's no booking path - the button just shows "View Property" and navigates back.

Additionally, the `getLowestRate()` function in RoomShowcase needs to check `linkedRateTypes` from the property's `pms_rate_types` the same way `getLowestRateForRoom()` in PropertyShowcase does.

**Solution:**
- Add manual rates property handling to `handleCheckAvailability()`
- Fix rate retrieval to check linked rate types
- Add a direct booking option for manual properties

### Issue 3: Travel Concierge - Can't Just Click "Book Now" Without Asking a Question
**Root Cause:** The `handleBookNowClick()` function in AIConciergePanel correctly:
1. Opens date picker if no dates selected
2. Auto-adds room for single-room properties when dates are selected
3. Scrolls to rooms section for multi-room properties

However, the issue is that after selecting dates, users expect the room to be automatically added and then navigate to checkout. Currently:
- For single-room properties: It adds to cart but doesn't navigate to checkout
- Users need to tap "Book Now" again or find the checkout button

**Solution:** After successfully adding a single-room property to the cart, automatically navigate to the booking page.

---

## Technical Implementation

### Phase 1: Fix "Book Now" Button Below Map

**File: `src/pages/PropertyShowcase.tsx`**

Update `handleBookProperty()` to work seamlessly with AI Concierge mode:

```typescript
const handleBookProperty = () => {
  if (isNightsBridgeProperty) {
    const bbid = getNightsBridgeBBID();
    if (bbid && nightsBridgeAgentCode) {
      setExternalBookingUrl(getNightsBridgeBookingUrl(bbid, nightsBridgeAgentCode));
      setShowLeavingModal(true);
      return;
    }
  }
  
  // If there are already booked rooms, go to checkout
  if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && bookedRooms.length > 0) {
    navigate(`/booking/${property?.slug || property?.id}`);
    return;
  }
  
  // For single-room properties, scroll to rooms section where AI Concierge handles booking
  // The AI Concierge strip at the bottom will be visible for date selection
  const rooms = getRoomTypes();
  if (rooms.length === 1) {
    // Scroll to ensure room is visible, then the bottom booking strip handles the rest
    scrollToRooms();
    return;
  }
  
  // For multi-room properties, scroll to rooms section
  scrollToRooms();
};
```

The key insight is that when AI Concierge is active, the "Book Now" button should scroll to the rooms section where users can see the room details while the floating booking strip at the bottom lets them select dates and book.

### Phase 2: Fix Room Details Page Booking

**File: `src/pages/RoomShowcase.tsx`**

1. **Add manual rates property detection:**

```typescript
// After line 295 (after isHostfullyProperty)
const isManualRatesProperty = property?.external_system === 'none' || (!property?.external_system && room);
```

2. **Update `getLowestRate()` to check linked rate types (lines 437-493):**

```typescript
const getLowestRate = (): number | null => {
  // Check linked rate types first (wizard-configured rates)
  const roomAny = room as any;
  if (roomAny?.linkedRateTypes?.length > 0) {
    const pmsRateTypes = property?.amenities?.pms_rate_types || [];
    for (const rateTypeId of roomAny.linkedRateTypes) {
      const rateType = pmsRateTypes.find((rt: any) => rt.id === rateTypeId);
      if (rateType?.baseRate) {
        return rateType.baseRate;
      }
    }
  }
  
  // Check direct room rates
  if (roomAny?.baseRate || roomAny?.base_rate || roomAny?.daily_rate) {
    return roomAny.baseRate || roomAny.base_rate || roomAny.daily_rate;
  }
  
  // ... rest of existing rate checks (liveRates, cachedRate, pms_rates, property_rates)
};
```

3. **Update `handleCheckAvailability()` to handle manual rates (lines 370-395):**

```typescript
const handleCheckAvailability = () => {
  // NightsBridge handling (unchanged)
  if (isNightsBridgeProperty) {
    // ... existing code
  }
  
  // For Benson, HotelBeds, Hostfully, OR manual rates: navigate to availability or booking
  if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && property && room) {
    const roomSlugName = slugifyRoomName(room.name);
    const params = new URLSearchParams(window.location.search);
    const queryString = params.toString();
    
    // For manual rates, navigate back to property with room selected
    // The AI Concierge panel on the property page handles booking
    if (isManualRatesProperty) {
      navigate(`/property/${property.slug || property.id}#rooms-section${queryString ? `?${queryString}` : ''}`);
      return;
    }
    
    navigate(`/property/${property.slug || property.id}/room/${roomSlugName}/availability${queryString ? `?${queryString}` : ''}`);
    return;
  }
  
  // Fallback: go back to property page
  if (property) {
    navigate(`/property/${property.slug || property.id}`);
  }
};
```

4. **Update button text for manual rates (lines 905-922):**

```typescript
<Button className="w-full" size="lg" onClick={handleCheckAvailability}>
  {isNightsBridgeProperty ? (
    <>
      <ExternalLink className="mr-2 h-4 w-4" />
      Book Now
    </>
  ) : (isBensonProperty || isHotelBedsProperty || isHostfullyProperty) ? (
    <>
      <Calendar className="mr-2 h-4 w-4" />
      Check Availability
    </>
  ) : isManualRatesProperty ? (
    <>
      <Calendar className="mr-2 h-4 w-4" />
      Select Dates & Book
    </>
  ) : (
    <>
      <ArrowLeft className="mr-2 h-4 w-4" />
      View Property
    </>
  )}
</Button>
```

### Phase 3: Fix Travel Concierge "Book Now" Flow

**File: `src/components/booking/AIConciergePanel.tsx`**

Update `handleBookNowClick()` to navigate to checkout after adding a single-room property:

```typescript
const handleBookNowClick = () => {
  // If no dates selected, open date picker
  if (!checkInDate || !checkOutDate) {
    setDatePickerOpen(true);
    return;
  }
  
  // For single-room properties, auto-add to cart AND navigate to checkout
  if (roomTypes.length === 1) {
    const room = roomTypes[0];
    const nights = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Get rate from availability map or room data
    const dateKey = format(checkInDate, 'yyyy-MM-dd');
    const dayData = availabilityMap?.get(dateKey);
    const roomRate = dayData?.rate || (room as any).baseRate || (room as any).base_rate || 0;
    const totalPrice = roomRate * nights;
    
    addStay({
      property_id: propertyId,
      property_name: propertyName,
      property_slug: propertySlug,
      property_image: propertyImage || '',
      external_system: externalSystem || 'none',
      dates: {
        check_in: format(checkInDate, 'yyyy-MM-dd'),
        check_out: format(checkOutDate, 'yyyy-MM-dd'),
      },
      rooms: [{
        room_type_id: room.id,
        room_type_name: room.name,
        quantity: 1,
        rate_per_night: roomRate,
        total_price: totalPrice,
      }],
      guests: {
        adults: firstRoom.numberOfAdults,
        children: firstRoom.numberOfChildren,
        infants: firstRoom.numberOfInfants,
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
    
    // NEW: Navigate to checkout after adding
    // Use a short delay to allow state to update
    setTimeout(() => {
      window.location.href = `/booking/${propertySlug}`;
    }, 500);
    return;
  }
  
  // Multiple rooms - scroll to room section
  document.getElementById('rooms-section')?.scrollIntoView({ behavior: 'smooth' });
};
```

Also need to import `useNavigate` (or use window.location since navigate may not be available in this component).

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Update `handleBookProperty()` to scroll to rooms for AI Concierge mode |
| `src/pages/RoomShowcase.tsx` | Add `isManualRatesProperty` detection; Fix `getLowestRate()` to check linked rate types; Update `handleCheckAvailability()` for manual rates; Update button text |
| `src/components/booking/AIConciergePanel.tsx` | Update `handleBookNowClick()` to navigate to checkout after adding single-room property |

---

## Expected Outcomes

1. **"Book Now" below map**: Scrolls to rooms section where users can see the property and use the floating booking strip to select dates
2. **Room details page**: Shows correct rate (e.g., R2,650) from linked rate types; "Select Dates & Book" button navigates back to property with booking flow
3. **Travel Concierge**: After selecting dates and clicking "Book Now", single-room properties are added to cart and user is navigated to checkout automatically

---

## User Flow After Fix

```
[Property Showcase Page]
         │
         ├── Click "Book Now" (below map)
         │         │
         │         └── Scrolls to rooms section
         │                   │
         │                   └── Floating booking strip visible
         │                             │
         │                             ├── Tap "Dates" → Calendar opens
         │                             │
         │                             └── Tap "Book Now" → 
         │                                   ├── Single room: Add to cart → Navigate to checkout
         │                                   └── Multiple rooms: Scroll to room cards
         │
         └── Click room card
                   │
                   └── [Room Details Page]
                             │
                             ├── Shows price (R2,650/night)
                             │
                             └── Click "Select Dates & Book"
                                       │
                                       └── Navigates back to property → Booking strip
```

---

## Testing Checklist

- [ ] Visit `/property/latter-days`
- [ ] Scroll to bottom, click "Book Now" below map → Should scroll to rooms
- [ ] Use floating booking strip: Select dates → Click "Book Now" → Should add to cart and go to checkout
- [ ] Click room card → Go to room details → Verify price shows (R2,650)
- [ ] Click "Select Dates & Book" → Returns to property with booking flow
