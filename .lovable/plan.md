

# Plan: Complete Booking Flow Fix - SmartCart Visibility, Concierge UX, and Map Popover

## Issues Summary

1. **SmartCart never appears** - Cart is correctly added but concierge strip still shows, blocking visibility
2. **Concierge strip shows by default** - Should only appear after user initiates booking
3. **Date selection does nothing** - After confirming dates, nothing progresses the booking
4. **Map legend truncated** - Need popover for full attraction details
5. **Room page return flow broken** - Returns to property but doesn't continue booking

---

## Root Cause Analysis

### Issue 1: SmartCart Blocked by Concierge Strip
Both `SmartCart` (z-40) and `AIConciergePanel` collapsed strip (z-40) render at the same position. The `hasStays` check in AIConciergePanel (line 673) should hide the strip, but both still appear because they're in separate components with independent renders.

### Issue 2: Concierge Strip Always Visible
The concierge strip renders by default (line 729-898) on every property page. Users see booking controls before expressing intent to book.

### Issue 3: Date Selection Doesn't Progress
When dates are confirmed in `BottomSheetDatePicker`, it calls `onDatesChange` which only updates the context. There's no automatic "add to cart" action - users must manually click "Book Now" button afterward.

### Issue 4: Map Legend Truncation
The legend uses CSS truncation but no interactive element to reveal full names.

### Issue 5: Room Page Return Doesn't Continue
`RoomShowcase.handleCheckAvailability()` navigates back with `#rooms-section` and fires a `setTimeout` to trigger the date picker. But if user already selected dates on room page, they just need to add to cart, not re-select dates.

---

## Technical Implementation

### Phase 1: Hide Concierge Strip By Default - Show Only When Initiated

**File: `src/components/booking/AIConciergePanel.tsx`**

Add a new state to track if user has initiated booking:

```typescript
// Add new prop to control visibility
interface AIconciergePanelProps {
  // ... existing props
  initiallyHidden?: boolean; // Start hidden until user triggers
}

// Inside component, add state
const [isInitiated, setIsInitiated] = useState(false);

// Listen for trigger events
useEffect(() => {
  const handleInitiateBooking = () => {
    setIsInitiated(true);
    setDatePickerOpen(true);
  };
  
  window.addEventListener('openConciergeDatePicker', handleInitiateBooking);
  return () => {
    window.removeEventListener('openConciergeDatePicker', handleInitiateBooking);
  };
}, []);

// In mobile render section (line 729), add condition:
// If not initiated and no stays, show only a minimal trigger button
if (!isInitiated && !hasStays) {
  return (
    <>
      {/* Minimal floating button to initiate booking */}
      <div className="fixed bottom-4 right-4 z-40">
        <Button
          onClick={() => setIsInitiated(true)}
          className="rounded-full h-12 px-6 shadow-lg"
        >
          <Calendar className="h-4 w-4 mr-2" />
          Select Dates
        </Button>
      </div>
      
      {/* Date picker still needs to be available */}
      <BottomSheetDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        checkIn={checkInDate}
        checkOut={checkOutDate}
        onDatesChange={handleDatesChange}
        availabilityMap={availabilityMap}
      />
    </>
  );
}
```

### Phase 2: Auto-Add to Cart After Date Selection

**File: `src/components/booking/AIConciergePanel.tsx`**

Update `handleDatesChange` to auto-add for single-room properties:

```typescript
const handleDatesChange = (checkIn: Date, checkOut: Date) => {
  setDates(format(checkIn, 'yyyy-MM-dd'), format(checkOut, 'yyyy-MM-dd'));
  
  // For single-room properties, auto-add to cart after date selection
  if (roomTypes.length === 1) {
    const room = roomTypes[0];
    const nights = Math.ceil(
      (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    // Get rate from availability map or room data
    const dateKey = format(checkIn, 'yyyy-MM-dd');
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
    
    toast.success(`Added ${room.name} to your journey! Click Checkout to complete.`);
  }
};
```

### Phase 3: Ensure SmartCart Takes Precedence

The existing `if (hasStays)` check (line 673) should work, but we need to make sure it renders NOTHING so SmartCart can be visible. This is already correct but let's verify the SmartCart component renders properly in PropertyShowcase.

**File: `src/pages/PropertyShowcase.tsx`**

Move SmartCart OUTSIDE the AI Concierge conditional block so it always renders when there are stays:

```typescript
{/* SmartCart - ALWAYS shows when items are added, regardless of AI mode */}
{hasStays && (
  <SmartCart 
    onCheckout={() => setCheckoutOpen(true)}
  />
)}

{/* AI Concierge Mode */}
{aiConciergeEnabled && !aiFailed && (isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && !hasStays && (
  <ConciergeErrorBoundary onFallback={handleFallbackToLegacy}>
    <AIConciergePanel
      // ... props
    />
  </ConciergeErrorBoundary>
)}

{/* InlineCheckout - full-screen overlay */}
<InlineCheckout
  open={checkoutOpen}
  onClose={() => setCheckoutOpen(false)}
  onPaymentSuccess={handlePaymentSuccess}
  onPaymentCancelled={handlePaymentCancelled}
/>
```

### Phase 4: Add Popover to Map Legend Attractions

**File: `src/components/showcase/InvitationMap.tsx`**

Add Tooltip component for full attraction details:

```typescript
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// In the legend section (line 359-377):
{attractions.length > 0 && (
  <div className="mt-4 px-2">
    <p className="text-xs font-medium text-muted-foreground mb-2 text-center">Nearby:</p>
    <TooltipProvider>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
        {attractions.slice(0, 5).map((a, i) => (
          <Tooltip key={a.place_id}>
            <TooltipTrigger asChild>
              <button className="flex items-center gap-1.5 whitespace-nowrap hover:text-foreground transition-colors">
                <span 
                  className="w-2.5 h-2.5 rounded-full shrink-0" 
                  style={{ backgroundColor: ATTRACTION_COLORS[i] }} 
                />
                <span className="max-w-[140px] sm:max-w-[180px] truncate">
                  {a.name}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px]">
              <div className="space-y-1">
                <p className="font-medium">{a.name}</p>
                {a.rating && (
                  <p className="text-xs text-muted-foreground">
                    {'★'.repeat(Math.round(a.rating))} {a.rating.toFixed(1)}
                  </p>
                )}
                {a.vicinity && (
                  <p className="text-xs text-muted-foreground">{a.vicinity}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  </div>
)}
```

### Phase 5: Fix Room Page Return Flow

**File: `src/pages/RoomShowcase.tsx`**

When returning from room page with dates already selected, auto-add the room:

```typescript
const handleCheckAvailability = () => {
  // ... existing NightsBridge and PMS handling
  
  // For manual rates properties, check if we have dates and should auto-add
  if (isManualRatesProperty && property && room) {
    // Get dates from URL or context
    const params = new URLSearchParams(window.location.search);
    const checkInParam = params.get('checkIn');
    const checkOutParam = params.get('checkOut');
    
    // If we have dates from URL/context, auto-add the room to cart here
    if (checkInParam && checkOutParam) {
      const checkIn = new Date(checkInParam);
      const checkOut = new Date(checkOutParam);
      const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      const roomRate = getLowestRate() || 0;
      
      addStay({
        property_id: property.id,
        property_name: property.name,
        property_slug: property.slug || property.id,
        property_image: property.images?.[0] || '',
        external_system: property.external_system || 'none',
        dates: {
          check_in: checkInParam,
          check_out: checkOutParam,
        },
        rooms: [{
          room_type_id: room.id,
          room_type_name: room.name,
          quantity: 1,
          rate_per_night: roomRate,
          total_price: roomRate * nights,
        }],
        guests: { adults: 2, children: 0, infants: 0 },
        price_breakdown: {
          subtotal: roomRate * nights,
          fees: [],
          taxes: [],
          total: roomRate * nights,
        },
        availability_status: 'available',
        nights,
      });
      
      toast.success(`Added ${room.name} to your journey!`);
      navigate(`/property/${property.slug || property.id}#checkout`);
      return;
    }
    
    // No dates - navigate back to property page and trigger date picker
    navigate(`/property/${property.slug || property.id}#rooms-section`);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openConciergeDatePicker'));
    }, 600);
    return;
  }
};
```

Also need to import `useItinerary` and use `addStay` in RoomShowcase.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/booking/AIConciergePanel.tsx` | Add `isInitiated` state; Hide strip by default; Auto-add to cart after date selection |
| `src/pages/PropertyShowcase.tsx` | Move SmartCart outside AI conditional; Hide concierge when hasStays |
| `src/components/showcase/InvitationMap.tsx` | Add Tooltip popover for full attraction names with ratings |
| `src/pages/RoomShowcase.tsx` | Import useItinerary; Auto-add room if dates in URL; Navigate to checkout |

---

## Expected User Flow After Fix

```
[Property Showcase]
     │
     ├── User sees: Room card + "Select Dates" floating button (minimal UI)
     │
     ├── Click "Select Dates" OR "Book Now" below map
     │         │
     │         └── Date picker opens
     │                   │
     │                   └── Select Feb 2-7, click "Confirm Dates"
     │                             │
     │                             └── Auto-adds room to cart (single-room property)
     │                                       │
     │                                       └── Toast: "Added to your journey!"
     │                                                 │
     │                                                 └── SmartCart appears at bottom
     │
     └── SmartCart shows: [🛍️ 1] 3 Bedroomed House | 5 nights | R13,250 [Checkout]
               │
               └── Click "Checkout" → InlineCheckout overlay opens
```

---

## Testing Checklist

- [ ] Visit `/property/latter-days` - should see minimal "Select Dates" button, NOT full concierge strip
- [ ] Click "Select Dates" - date picker opens
- [ ] Select dates Feb 2-7 - toast appears, SmartCart appears at bottom
- [ ] SmartCart shows property name, nights, total price, "Checkout" button
- [ ] Click "Checkout" on SmartCart - InlineCheckout overlay opens
- [ ] Click attraction in map legend - tooltip shows full name and rating
- [ ] Go to room page, select dates, confirm - adds to cart and navigates back

