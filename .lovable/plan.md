
# Fix Plan: Payment Flow & Desktop Concierge Visibility

## Problems Identified

### Problem 1: Payment Flow Broken
The `InlineCheckout` component calls `payfast-api` with `action: 'create_payment'` which **does not exist** in the edge function. The valid actions are:
- `initiate_payment` (redirect-based)
- `initiate_onsite_payment` (modal-based, requires a booking UUID)
- `verify_itn` 
- `verify_payment`

Additionally, the flow is incorrect:
1. `InlineCheckout` saves an **itinerary** to `itineraries` table
2. Calls PayFast with itinerary ID expecting a UUID back
3. Passes that to `PayFastOnsiteModal` which then calls `initiate_onsite_payment` expecting a **booking** UUID from the `bookings` table

**The fix**: Create an actual booking record from the itinerary before initiating payment, then use the booking ID for PayFast.

### Problem 2: Desktop Concierge Not Minimized on First Load
The `isInitiated` state (line 98) controls visibility for **mobile only** (line 779-813). The desktop path (line 501-718) has no such check - it shows the full sidebar immediately regardless of `isInitiated`.

**The fix**: Apply the same `isInitiated` check to the desktop render path, showing only a minimal floating button until the user initiates booking.

---

## Technical Implementation

### Phase 1: Fix Desktop Concierge Visibility

**File: `src/components/booking/AIConciergePanel.tsx`**

At line 501 (beginning of desktop render), add an early return for uninitiated state before the minimized check:

```typescript
// Desktop sidebar
if (!isMobile) {
  // Hide completely if SmartCart has items
  if (hasStays) {
    return (
      <BottomSheetDatePicker
        open={datePickerOpen}
        onOpenChange={setDatePickerOpen}
        checkIn={checkInDate}
        checkOut={checkOutDate}
        onDatesChange={handleDatesChange}
        availabilityMap={availabilityMap}
      />
    );
  }
  
  // NEW: If not initiated, show only minimal floating button (same as mobile)
  if (!isInitiated) {
    return (
      <>
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          onClick={() => {
            setIsInitiated(true);
            setDatePickerOpen(true);
          }}
          className={cn(
            "fixed right-6 bottom-6 z-40 h-14 px-6 rounded-full gap-2",
            "bg-primary text-primary-foreground shadow-xl",
            "flex items-center justify-center",
            "hover:scale-105 transition-transform",
            className
          )}
        >
          <Calendar className="h-5 w-5" />
          <span className="font-medium">Select Dates</span>
        </motion.button>
        
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
  
  // Existing minimized state and full sidebar...
```

### Phase 2: Fix Payment Flow in InlineCheckout

**File: `src/components/booking/InlineCheckout.tsx`**

The payment flow needs to:
1. Save itinerary to database (already done)
2. **Create a booking record** from the first stay in the itinerary
3. Call `payfast-api` with `action: 'initiate_onsite_payment'` and the booking ID
4. Use the returned UUID to open PayFast modal

Update `handlePayment` function (~line 65-112):

```typescript
const handlePayment = async () => {
  if (!validateForm()) {
    toast.error("Please fill in all required fields");
    return;
  }

  if (stays.length === 0) {
    toast.error("No items in cart");
    return;
  }

  setIsSubmitting(true);
  
  try {
    // Save itinerary first
    const itineraryId = await saveToDatabase();
    if (!itineraryId) {
      throw new Error("Failed to save itinerary");
    }

    // Create booking record from first stay (multi-property would need loop)
    const firstStay = stays[0];
    
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        property_id: firstStay.property_id,
        itinerary_id: itineraryId,
        room_type_id: firstStay.rooms[0]?.room_type_id || null,
        check_in_date: firstStay.dates.check_in,
        check_out_date: firstStay.dates.check_out,
        nights: firstStay.nights,
        guests: firstStay.guests.adults + firstStay.guests.children,
        adults: firstStay.guests.adults,
        children: firstStay.guests.children,
        infants: firstStay.guests.infants,
        guest_name: guestDetails.name,
        guest_email: guestDetails.email,
        guest_phone: guestDetails.phone,
        total_price: totalPrice,
        status: 'pending',
        payment_status: 'pending',
        source: 'rol-website',
        special_requests: specialRequests || null,
      })
      .select('id')
      .single();

    if (bookingError || !booking) {
      console.error('Booking creation error:', bookingError);
      throw new Error("Failed to create booking");
    }

    // Get PayFast UUID using the BOOKING ID
    const { data, error } = await supabase.functions.invoke('payfast-api', {
      body: {
        action: 'initiate_onsite_payment',  // FIXED: correct action
        booking_id: booking.id,              // FIXED: use booking UUID
      }
    });

    if (error || !data?.success) {
      throw new Error(data?.error || data?.details || "Failed to initiate payment");
    }

    // Store booking ID for success handler
    setBookingId(booking.id);
    setPayFastUuid(data.uuid);
    setShowPayFastModal(true);
  } catch (err) {
    console.error('Payment initiation error:', err);
    toast.error(err instanceof Error ? err.message : "Failed to start payment");
  } finally {
    setIsSubmitting(false);
  }
};
```

Also need to add state for `bookingId`:

```typescript
const [bookingId, setBookingId] = useState<string | null>(null);
```

And update the PayFastOnsiteModal props to pass amount properly (since it's already passed):

```tsx
{payFastUuid && bookingId && (
  <PayFastOnsiteModal
    isOpen={showPayFastModal}
    onClose={() => {
      setShowPayFastModal(false);
      setPayFastUuid(null);
    }}
    onPaymentSuccess={handlePayFastSuccess}
    onPaymentCancelled={handlePayFastCancelled}
    bookingId={bookingId}  // Pass actual booking ID for reference
    amount={totalPrice}
    propertyName={stays.map(s => s.property_name).join(', ')}
    isSandbox={true}
  />
)}
```

### Phase 3: Update PayFastOnsiteModal to Skip Double-Init

The `PayFastOnsiteModal` currently calls `payfast-api` again with `initiate_onsite_payment`. Since we already have the UUID from `InlineCheckout`, we should pass the UUID directly and skip the re-call.

**File: `src/components/booking/PayFastOnsiteModal.tsx`**

Update props to accept an optional `uuid` directly:

```typescript
interface PayFastOnsiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPaymentSuccess: () => void;
  onPaymentCancelled: () => void;
  bookingId: string;
  amount: number;
  propertyName: string;
  isSandbox?: boolean;
  uuid?: string;  // NEW: Optional pre-fetched UUID
}
```

Update the initiate payment effect to skip API call if UUID is provided:

```typescript
// Get payment UUID and trigger modal
useEffect(() => {
  if (!isOpen || !scriptLoaded || paymentUuid) return;
  
  // If UUID was pre-provided, use it directly
  if (props.uuid) {
    setPaymentUuid(props.uuid);
    triggerOnsitePayment(props.uuid);
    return;
  }

  // Otherwise fetch from API (existing logic)
  const initiatePayment = async () => {
    // ... existing code
  };

  initiatePayment();
}, [isOpen, scriptLoaded, paymentUuid, props.uuid, bookingId, triggerOnsitePayment]);
```

And update InlineCheckout to pass the UUID:

```tsx
<PayFastOnsiteModal
  isOpen={showPayFastModal}
  // ...
  uuid={payFastUuid}  // Pass pre-fetched UUID
/>
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/booking/AIConciergePanel.tsx` | Add `isInitiated` check to desktop render path (~line 501) |
| `src/components/booking/InlineCheckout.tsx` | Fix payment flow: create booking record, use correct API action |
| `src/components/booking/PayFastOnsiteModal.tsx` | Accept optional `uuid` prop to skip double API call |

---

## Expected Behavior After Fix

### Desktop Concierge:
- Page load: Only "Select Dates" floating button visible (bottom-right)
- User clicks button: Full concierge sidebar appears
- User clicks X on sidebar: Minimizes to sparkle icon

### Payment Flow:
1. User fills checkout form, clicks "Pay R13,250"
2. System creates booking record in database
3. Calls PayFast API with booking ID, gets UUID
4. Opens PayFast modal with test card form
5. User enters card (4000000000000002), submits
6. PayFast callback fires, redirects to confirmation

---

## Testing Checklist

- [ ] Desktop: Visit `/property/latter-days` - should see ONLY "Select Dates" button, NOT full sidebar
- [ ] Desktop: Click "Select Dates" - full sidebar appears
- [ ] Mobile: Same behavior - only button until initiated
- [ ] Add room to cart, click Checkout
- [ ] Fill guest details (name, email, phone)
- [ ] Click "Pay" button - should see PayFast sandbox modal
- [ ] Enter test card 4000000000000002, CVV 123, any future date
- [ ] Complete payment - should redirect to confirmation page
