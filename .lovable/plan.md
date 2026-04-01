

# Fix: "Select Dates & Book" Skips Date Selection on RoomShowcase

## Problem

`MobileBookingContext` initializes with default dates (tomorrow/day-after) in `getDefaultState()`. In `RoomShowcase.handleCheckAvailability()`, the fallback on line 427 reads these default dates and treats them as "user-selected dates", immediately adding the stay to cart and navigating to checkout. The user never gets to pick dates.

## Fix (1 file)

**`src/pages/RoomShowcase.tsx`** — line 427

Only trust MobileBookingContext dates if they were explicitly set during this session (i.e., the user interacted with a date picker on the property page). The simplest reliable approach: **only use URL search params** as the date source in `handleCheckAvailability`. Remove the `mobileBooking?.state` fallback.

```
// Before (line 427-428):
const checkInParam = searchParams.get('checkIn') || mobileBooking?.state?.checkIn || null;
const checkOutParam = searchParams.get('checkOut') || mobileBooking?.state?.checkOut || null;

// After:
const checkInParam = searchParams.get('checkIn') || null;
const checkOutParam = searchParams.get('checkOut') || null;
```

This means when a user clicks "Select Dates & Book" without having selected dates via URL params, they'll be routed to `/book/{slug}?roomTypeId=...` which has the inline date picker with availability calendar — exactly the right UX.

Dates selected via the AI Concierge on the property page will still work because the concierge dispatches navigation with URL params included.

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/RoomShowcase.tsx` line 427-428 | Remove `mobileBooking?.state` fallback from date detection |

