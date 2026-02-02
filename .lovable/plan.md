
# Unify Checkout Flow: Single Journey-Based Checkout

## Problem Summary

Currently there are **three separate checkout paths** in the application:

1. **InlineCheckout** (PropertyShowcase SmartCart → bottom sheet checkout)
   - Missing `user_id` on booking insert
   - Missing anonymous authentication
   - Causes 403 RLS errors on payment

2. **JourneyCheckout** (`/journey/checkout` page)
   - Has proper anonymous authentication
   - Sets `user_id` correctly
   - Works correctly after recent fix

3. **Legacy Booking** (`/booking/:slug` page)
   - Old flow with complex state management
   - Still referenced from several places

## Solution

Consolidate all checkout flows to use the **Journey Checkout page** (`/journey/checkout`). This involves:

1. **Replace InlineCheckout with redirect to Journey Checkout**
2. **Update StickyBookingCTA to route to Journey Checkout**
3. **Ensure SmartCart leads to Journey Checkout**

---

## Implementation Details

### Step 1: Update PropertyShowcase to redirect to JourneyCheckout

**File**: `src/pages/PropertyShowcase.tsx`

Change the checkout flow:
- When `SmartCart.onCheckout` is triggered, navigate to `/journey/checkout` instead of opening `InlineCheckout`
- Remove the `InlineCheckout` component from PropertyShowcase

```typescript
// Before (line 859):
<SmartCart 
  onCheckout={() => setCheckoutOpen(true)}
/>

// After:
<SmartCart 
  onCheckout={() => navigate('/journey/checkout')}
/>
```

Remove the `InlineCheckout` component usage and `checkoutOpen` state.

### Step 2: Update StickyBookingCTA checkout action

**File**: `src/pages/PropertyShowcase.tsx`

In `handleBookProperty()` function (around line 657-659), change:
```typescript
// Before:
if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && bookedRooms.length > 0) {
  navigate(`/booking/${property?.slug || property?.id}`);
  return;
}

// After:
if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && bookedRooms.length > 0) {
  navigate('/journey/checkout');
  return;
}
```

And for the SmartCart checkout (around line 663-665):
```typescript
// Before:
if (hasStays) {
  setCheckoutOpen(true);
  return;
}

// After:
if (hasStays) {
  navigate('/journey/checkout');
  return;
}
```

### Step 3: Remove InlineCheckout component reference

**File**: `src/pages/PropertyShowcase.tsx`

- Remove import: `import { InlineCheckout } from "@/components/booking/InlineCheckout";`
- Remove state: `const [checkoutOpen, setCheckoutOpen] = useState(false);`
- Remove callback: `handlePaymentSuccess` and `handlePaymentCancelled`
- Remove JSX: The `<InlineCheckout>` component rendering

### Step 4: Update other references to `/booking/` route

**Files to check and update**:
- `src/components/SearchForm.tsx` - Line 236
- `src/pages/StagingBook.tsx` - Line 216  
- `src/components/RoomAvailabilityCalendar.tsx` - Line 632

For these, the logic depends on context - if they're adding to itinerary flow, redirect to `/journey/checkout`. If they're legacy flows, leave as-is for now but ensure they add to ItineraryContext first.

---

## Files to Modify

1. **`src/pages/PropertyShowcase.tsx`**
   - Remove `InlineCheckout` import
   - Remove `checkoutOpen` state
   - Remove `handlePaymentSuccess` and `handlePaymentCancelled` callbacks
   - Update `SmartCart.onCheckout` to navigate to `/journey/checkout`
   - Update `handleBookProperty` to navigate to `/journey/checkout` instead of `/booking/`
   - Remove `<InlineCheckout>` JSX

---

## Benefits

1. **Single checkout flow** - All bookings go through JourneyCheckout
2. **Proper authentication** - Anonymous sign-in ensures RLS policies work
3. **Consistent user experience** - Same checkout UI and process everywhere
4. **Easier maintenance** - One checkout implementation to maintain

---

## Verification Steps

After implementation:
1. Navigate to a property showcase page
2. Add a room to the cart via AI Concierge or date picker
3. Click "Checkout" on SmartCart
4. Verify you're redirected to `/journey/checkout` page
5. Complete the checkout and verify payment works
6. Verify confirmation email is sent
