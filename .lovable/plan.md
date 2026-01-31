

# Plan: Streamline Journey Booking Flow and Fix Critical UX Issues

## Summary of Issues Identified

Based on code analysis, the user is experiencing these interconnected issues:

1. **Two Competing Booking Flows**: The codebase has two parallel booking flows:
   - **"Journey" Flow**: PropertyShowcase -> QuickBookDrawer -> ItineraryContext -> /journey/review -> /journey/checkout
   - **"Legacy/Single" Flow**: PropertyShowcase -> QuickBookDrawer -> /booking/:slug (Booking.tsx)

   Currently, `QuickBookDrawer.handleContinueToCheckout()` routes to `/booking/:slug` (legacy), NOT the journey flow!

2. **Dates Not Passing Through**: MobileBookingContext dates are read in QuickBookDrawer but:
   - The initial FloatingDateGuestPicker on PropertyShowcase updates `MobileBookingContext`
   - QuickBookDrawer reads from MobileBookingContext for initial values only - if drawer was previously opened/closed, local state may not sync

3. **JourneyBuilder Blocking Checkout on Mobile**: The floating JourneyBuilder panel sits at `bottom-4 right-4` with a fixed width of `w-80`. On mobile, this overlaps with checkout buttons in the QuickBookDrawer footer (which also appears at the bottom).

4. **Too Many Clicks**: Current flow requires 6+ clicks:
   1. Select dates on PropertyShowcase (FloatingDateGuestPicker) 
   2. Click "Book Now" to open QuickBookDrawer
   3. Select room (if multiple)
   4. Confirm dates (often re-select since not synced)
   5. Set guests
   6. Click "Continue to Checkout"
   7. Land on /booking/:slug - fill guest details
   8. Click "Complete Booking"

   Target: 2-3 steps maximum

---

## Solution Architecture: Unify to Journey-Only Flow

### Core Change: Remove Legacy Booking Route Dependency

**File: `src/components/booking/QuickBookDrawer.tsx`**

Change the `handleContinueToCheckout` function to route to Journey flow instead of legacy `/booking/:slug`:

```typescript
const handleContinueToCheckout = () => {
  if (!checkIn || !checkOut || !selectedRoomId) return;
  
  const selectedRoom = roomTypes.find(r => r.id === selectedRoomId);
  const nights = differenceInDays(checkOut, checkIn);
  
  // Add to itinerary context
  addStay({
    property_id: propertyId,
    property_name: propertyName,
    property_slug: propertySlug,
    property_image: propertyImage || "",
    external_system: externalSystem || "",
    dates: {
      check_in: format(checkIn, "yyyy-MM-dd"),
      check_out: format(checkOut, "yyyy-MM-dd"),
    },
    rooms: [{
      room_type_id: selectedRoomId,
      room_type_name: selectedRoom?.name || "",
      quantity: 1,
      rate_per_night: estimatedPrice ? estimatedPrice / nights : 0,
      total_price: estimatedPrice || 0,
    }],
    guests,
    price_breakdown: {
      subtotal: estimatedPrice || 0,
      fees: [],
      taxes: [],
      total: estimatedPrice || 0,
    },
    availability_status: 'available',
    nights,
  });
  
  onOpenChange(false);
  
  // Go directly to journey checkout (skip review for single-stay)
  navigate('/journey/checkout');
};
```

This reduces the flow to:
1. Select dates + guests on PropertyShowcase
2. Click "Book Now" -> QuickBookDrawer confirms room & price
3. Click "Continue to Checkout" -> JourneyCheckout for guest details + payment

**That's 3 steps maximum.**

---

### Fix 1: Sync Dates Between FloatingDateGuestPicker and QuickBookDrawer

**File: `src/components/booking/QuickBookDrawer.tsx`**

Add a `useEffect` to sync dates from MobileBookingContext whenever the drawer opens:

```typescript
// Sync dates from MobileBookingContext when drawer opens
useEffect(() => {
  if (open) {
    // Always sync from MobileBookingContext when drawer opens
    if (mobileBookingState.checkIn) {
      setCheckIn(new Date(mobileBookingState.checkIn));
    }
    if (mobileBookingState.checkOut) {
      setCheckOut(new Date(mobileBookingState.checkOut));
    }
  }
}, [open, mobileBookingState.checkIn, mobileBookingState.checkOut]);
```

Also update the date picker to write back to MobileBookingContext:

```typescript
const handleDatesChange = (newCheckIn: Date, newCheckOut: Date) => {
  setCheckIn(newCheckIn);
  setCheckOut(newCheckOut);
  
  // Sync back to MobileBookingContext for consistency
  const { setDates } = useMobileBooking();
  setDates(format(newCheckIn, "yyyy-MM-dd"), format(newCheckOut, "yyyy-MM-dd"));
};
```

---

### Fix 2: Reposition JourneyBuilder on Mobile to Not Block CTAs

**File: `src/components/journey/JourneyBuilder.tsx`**

Change the positioning to avoid blocking bottom CTAs on mobile:

```typescript
<motion.div
  initial={{ y: 100, opacity: 0 }}
  animate={{ y: 0, opacity: 1 }}
  exit={{ y: 100, opacity: 0 }}
  className={cn(
    "fixed z-50",
    // On mobile: position above the safe area and FloatingDateGuestPicker
    // Use bottom-24 to clear the floating picker (~80px height)
    "bottom-24 right-4 sm:bottom-4",
    "w-80 max-w-[calc(100vw-2rem)]"
  )}
>
```

Alternatively, implement a "minimized" state on mobile that shows just a pill with count, not the full panel:

```typescript
const isMobile = useIsMobile();

// On mobile, auto-minimize when not expanded
const showMinimal = isMobile && !isExpanded;

return (
  <motion.div className={cn(
    "fixed z-50",
    showMinimal 
      ? "bottom-24 right-4" // Above the picker when minimized
      : "bottom-4 right-4"   // Normal position when expanded
  )}>
    {showMinimal ? (
      // Minimal pill view for mobile
      <button
        onClick={() => setIsExpanded(true)}
        className="flex items-center gap-2 px-4 py-2 bg-card border rounded-full shadow-lg"
      >
        <Map className="h-4 w-4 text-primary" />
        <span className="text-sm font-medium">{stayCount} stay{stayCount !== 1 ? 's' : ''}</span>
        <span className="text-sm font-semibold text-primary">{formatCurrency(totalPrice)}</span>
      </button>
    ) : (
      // Full panel view
      <div className="bg-card border rounded-xl shadow-xl">
        {/* existing content */}
      </div>
    )}
  </motion.div>
);
```

---

### Fix 3: Hide JourneyBuilder on Booking/Checkout Pages

The JourneyBuilder is shown on Booking.tsx (legacy flow) which causes confusion. Since we're unifying to Journey flow:

**File: `src/pages/Booking.tsx`**

Add `hideJourneyBuilder` prop to PublicLayout:

```typescript
return (
  <PublicLayout 
    backLabel="Back to Property" 
    backTo={`/property/${property.slug || property.id}`}
    hideJourneyBuilder // Hide the floating builder on checkout pages
  >
```

---

### Fix 4: Simplify QuickBookDrawer Flow for Single-Room Properties

For properties with only one room type (like holiday houses), skip the room selection step entirely:

**File: `src/components/booking/QuickBookDrawer.tsx`**

The drawer already auto-selects single rooms. Enhance by showing a more streamlined view:

```typescript
// If single room and dates are pre-selected, show condensed view
const isReadyToBook = checkIn && checkOut && selectedRoomId && estimatedPrice;

// ... in render:
{isReadyToBook && roomTypes.length === 1 && (
  <div className="space-y-4">
    {/* Single room display */}
    <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
      <Home className="h-5 w-5 text-primary" />
      <div className="flex-1">
        <p className="font-medium text-sm">{selectedRoom?.name}</p>
        <p className="text-xs text-muted-foreground">
          {format(checkIn, "MMM d")} – {format(checkOut, "MMM d, yyyy")} · {nights} nights
        </p>
      </div>
      <Check className="h-4 w-4 text-primary" />
    </div>
    
    {/* Price */}
    <div className="p-4 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10">
      <div className="flex justify-between items-center">
        <span>Estimated total</span>
        <span className="text-xl font-bold">
          <FormattedPrice amount={estimatedPrice} />
        </span>
      </div>
    </div>
  </div>
)}
```

---

## Files to Modify

1. **`src/components/booking/QuickBookDrawer.tsx`**
   - Route to `/journey/checkout` instead of `/booking/:slug`
   - Add date sync from MobileBookingContext on drawer open
   - Simplify view for single-room, ready-to-book scenarios

2. **`src/components/journey/JourneyBuilder.tsx`**
   - Reposition on mobile to `bottom-24` to avoid blocking CTAs
   - Add minimal pill view option for mobile

3. **`src/pages/Booking.tsx`**
   - Add `hideJourneyBuilder` to PublicLayout
   - (Optional) Add redirect to journey flow if stays exist in context

4. **`src/pages/JourneyCheckout.tsx`**
   - Handle single-stay flow gracefully (already works, just verify)

---

## User Flow After Changes

**Streamlined 3-Step Journey:**

1. **PropertyShowcase**: User sees property, taps dates in FloatingDateGuestPicker, adjusts guests
2. **QuickBookDrawer**: Opens with dates pre-filled, confirms room & price, taps "Continue to Checkout"  
3. **JourneyCheckout**: Enters guest details, completes booking

**Mobile Specifically:**
- JourneyBuilder floats above the date picker, showing as a minimal pill
- Tapping pill expands to review journey
- Checkout button always visible and accessible

---

## Technical Considerations

- **Backward Compatibility**: The legacy `/booking/:slug` route can remain for direct links, but primary flow uses Journey
- **Session Persistence**: ItineraryContext already persists to sessionStorage
- **Guest Details Sticky**: Already implemented via localStorage in ItineraryContext
- **PMS Integration**: JourneyCheckout already calls `multi-push-booking` which handles all PMS types

