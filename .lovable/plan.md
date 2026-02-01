
# Plan: Fix Booking Flow - SmartCart, Concierge Navigation, Map Legend, and Room Page

## Issues Identified

### Issue 1: SmartCart Never Appears
**Root Cause:** The `SmartCart` component only shows when `hasStays` is true (line 21 of SmartCart.tsx: `if (!hasStays) return null`). The `AIConciergePanel.handleBookNowClick()` correctly adds a stay using `addStay()`, but there are TWO problems:
1. Both `SmartCart` (z-40) and `AIConciergePanel` collapsed strip (z-40) render at the same fixed bottom position, overlapping each other
2. After adding a stay, the code immediately navigates away with `window.location.href = /booking/${propertySlug}` (line 381), so the user never sees the SmartCart

**Solution:** 
- After adding a stay, show the SmartCart instead of immediately navigating
- Add a "Checkout" button to SmartCart that navigates to checkout
- Hide the AIConciergePanel collapsed strip when SmartCart has items

### Issue 2: "Book Now" Below Map Just Scrolls to Room Card
**Root Cause:** The `InvitationMap.onBookNow` calls `handleBookProperty()` which, for AI Concierge mode, just calls `scrollToRooms()` (line 666). This only scrolls to the room section - it doesn't open the date picker or progress the booking.

**Solution:** 
- Update `handleBookProperty()` to open the date picker when AI Concierge is active, not just scroll

### Issue 3: Travel Concierge - No Way to Proceed After Date Selection
**Root Cause:** The `handleBookNowClick()` adds the stay and then immediately redirects to `/booking/${propertySlug}`. But this is the old Booking.tsx page, not the new InlineCheckout. The InlineCheckout is triggered by `setCheckoutOpen(true)` which is only called when SmartCart's `onCheckout` is fired.

**Solution:**
- After adding a stay, DON'T navigate away
- Let SmartCart appear (it will now show because hasStays is true)
- User clicks "Checkout" on SmartCart, which opens InlineCheckout

### Issue 4: Map Legend Truncates Attraction Names
**Root Cause:** Line 366 of InvitationMap.tsx truncates names to 18 characters: `{(a.name || '').substring(0, 18)}{(a.name?.length || 0) > 18 ? '...' : ''}`

**Solution:**
- Show all 5 attractions (currently limited to 3 via `.slice(0, 3)`)
- Remove character truncation or increase limit
- Make legend scrollable/wrap on mobile

### Issue 5: Room Page Date Picker Just Returns to Property
**Root Cause:** In RoomShowcase.tsx line 396-400, for manual rates properties, `handleCheckAvailability()` just navigates back to property page with `#rooms-section` anchor. There's no integration with the AI Concierge date selection.

**Solution:**
- Pass selected dates as URL params when navigating back
- Or integrate with MobileBookingContext to preserve dates

---

## Technical Implementation

### Phase 1: Fix SmartCart Visibility and Navigation

**File: `src/components/booking/AIConciergePanel.tsx`**

Update `handleBookNowClick()` to NOT navigate away after adding stay:

```typescript
const handleBookNowClick = () => {
  // If no dates selected, open date picker
  if (!checkInDate || !checkOutDate) {
    setDatePickerOpen(true);
    return;
  }
  
  // For single-room properties, auto-add to cart
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
    
    // REMOVED: Don't navigate away - let SmartCart appear instead
    // The SmartCart will show with a "Checkout" button
    return;
  }
  
  // Multiple rooms - scroll to room section
  document.getElementById('rooms-section')?.scrollIntoView({ behavior: 'smooth' });
};
```

### Phase 2: Hide AIConciergePanel When SmartCart Has Items

**File: `src/components/booking/AIConciergePanel.tsx`**

Import `hasStays` from ItineraryContext and conditionally hide the collapsed strip:

```typescript
const { addStay, totalPrice, hasStays } = useItinerary();

// In mobile render (line 668):
// Don't show the collapsed booking strip if SmartCart has items
// SmartCart will take over the bottom position
if (hasStays) {
  // Only render the date/guest picker modals, not the fixed bottom bar
  return (
    <>
      <BottomSheetDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        checkIn={checkInDate}
        checkOut={checkOutDate}
        onDatesChange={handleDatesChange}
        availabilityMap={availabilityMap}
      />
      <Drawer open={guestPickerOpen} onOpenChange={setGuestPickerOpen}>
        {/* ... guest picker content ... */}
      </Drawer>
    </>
  );
}
```

### Phase 3: Update SmartCart to Navigate to InlineCheckout

**File: `src/pages/PropertyShowcase.tsx`**

The SmartCart already has the correct `onCheckout` prop (line 867):
```typescript
<SmartCart 
  onCheckout={() => setCheckoutOpen(true)}
/>
```

This correctly opens `InlineCheckout`. No changes needed here - just need to ensure SmartCart shows.

### Phase 4: Fix "Book Now" Below Map to Open Date Picker

**File: `src/pages/PropertyShowcase.tsx`**

Update `handleBookProperty()` to trigger date picker when AI Concierge is active:

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
  
  // For PMS or manual rates properties with booked rooms, go to checkout
  if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && bookedRooms.length > 0) {
    navigate(`/booking/${property?.slug || property?.id}`);
    return;
  }
  
  // NEW: If SmartCart has items, open checkout
  if (hasStays) {
    setCheckoutOpen(true);
    return;
  }
  
  // When AI Concierge is active, scroll to rooms AND trigger date picker focus
  const aiConciergeIsActive = aiConciergeEnabled && !aiFailed && (isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty);
  if (aiConciergeIsActive) {
    scrollToRooms();
    // Dispatch a custom event to open date picker (AIConciergePanel listens)
    window.dispatchEvent(new CustomEvent('openConciergeDatePicker'));
    return;
  }
  
  // ... rest of existing code
};
```

**File: `src/components/booking/AIConciergePanel.tsx`**

Listen for the custom event to open date picker:

```typescript
useEffect(() => {
  const handleOpenDatePicker = () => {
    setDatePickerOpen(true);
  };
  
  window.addEventListener('openConciergeDatePicker', handleOpenDatePicker);
  return () => {
    window.removeEventListener('openConciergeDatePicker', handleOpenDatePicker);
  };
}, []);
```

### Phase 5: Fix Map Legend Truncation

**File: `src/components/showcase/InvitationMap.tsx`**

Update the legend section (lines 360-370):

```typescript
{/* Attractions Legend - below map, show all 5 */}
{attractions.length > 0 && (
  <div className="mt-4 px-4">
    <p className="text-xs font-medium text-muted-foreground mb-2">Nearby:</p>
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {attractions.slice(0, 5).map((a, i) => (
        <span key={a.place_id} className="flex items-center gap-1.5 whitespace-nowrap">
          <span 
            className="w-2.5 h-2.5 rounded-full shrink-0" 
            style={{ backgroundColor: ATTRACTION_COLORS[i] }} 
          />
          <span className="max-w-[180px] truncate" title={a.name}>
            {a.name}
          </span>
        </span>
      ))}
    </div>
  </div>
)}
```

Key changes:
- Show all 5 attractions (was sliced to 3)
- Use `max-w-[180px] truncate` instead of hard substring truncation
- Add `title` attribute for full name on hover
- Use `flex-wrap` for proper wrapping on mobile
- Add `whitespace-nowrap` to prevent breaking within a single attraction name

### Phase 6: Fix Room Page - Preserve Dates When Returning

**File: `src/pages/RoomShowcase.tsx`**

Update `handleCheckAvailability()` to pass current dates back to property page:

```typescript
// For manual rates properties, navigate back to property page with dates preserved
if (isManualRatesProperty && property) {
  const params = new URLSearchParams(window.location.search);
  
  // Get dates from MobileBookingContext or URL
  // Import useMobileBooking at top of file
  const { state: mobileBookingState } = useMobileBooking();
  
  if (mobileBookingState.checkIn) {
    params.set('checkIn', mobileBookingState.checkIn);
  }
  if (mobileBookingState.checkOut) {
    params.set('checkOut', mobileBookingState.checkOut);
  }
  
  const queryString = params.toString();
  navigate(`/property/${property.slug || property.id}${queryString ? `?${queryString}` : ''}#rooms-section`);
  
  // Trigger date picker to open after navigation
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('openConciergeDatePicker'));
  }, 500);
  return;
}
```

Also need to import `useMobileBooking` at the top.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/booking/AIConciergePanel.tsx` | Remove navigation after addStay; Hide collapsed strip when SmartCart has items; Add event listener for date picker trigger |
| `src/pages/PropertyShowcase.tsx` | Update handleBookProperty to trigger date picker event; Add hasStays check for checkout |
| `src/components/showcase/InvitationMap.tsx` | Show all 5 attractions; Remove hard truncation; Use CSS truncation with title |
| `src/pages/RoomShowcase.tsx` | Preserve dates in URL when navigating back; Import useMobileBooking |

---

## Expected User Flow After Fix

```
1. User visits /property/latter-days
   ↓
2. Sees room card with "From R2,650/night"
   ↓
3. Scrolls to map, clicks "Book Your Escape"
   ↓
4. Page scrolls to rooms section + Date picker opens automatically
   ↓
5. User selects Feb 2-7 in calendar
   ↓
6. User clicks "Book Now" in the booking strip
   ↓
7. Room auto-added to cart → Toast shows "Added to your journey!"
   ↓
8. SmartCart appears at bottom showing:
   [🛍️ 1] 3 Bedroomed Holiday House | 5 nights | 3 guests | R13,250 [Checkout]
   ↓
9. User clicks "Checkout" on SmartCart
   ↓
10. InlineCheckout overlay opens with guest details form
    ↓
11. User fills form, proceeds to PayFast payment
```

---

## Testing Checklist

- [ ] Visit `/property/latter-days`
- [ ] Scroll to map, click "Book Your Escape" → Date picker should open
- [ ] Select dates Feb 2-7 → Calendar closes
- [ ] Click "Book Now" → Toast shows, SmartCart appears at bottom
- [ ] Verify SmartCart shows correct room, dates, price
- [ ] Click "Checkout" on SmartCart → InlineCheckout overlay opens
- [ ] Fill guest details → PayFast modal opens
- [ ] Map legend shows all 5 attractions without hard truncation
- [ ] Click room card → Go to room page → Click "Select Dates & Book" → Returns to property with date picker open
