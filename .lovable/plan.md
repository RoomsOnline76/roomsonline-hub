

## Three Booking Flow Issues — Diagnosis & Fix Plan

### Issue 1: Checkout page shows "On request" instead of rates

**Root cause:** When navigating from the property page to `Booking.tsx`, the cost calculation relies on either:
- `ItineraryContext` having pre-calculated prices (from SmartCart/QuickBookDrawer)
- `pms_availability_cache` having rate data
- Wizard/amenities `room_types` having `base_rate`

For properties where none of these sources have rate data, `calculateCost()` either exits early (no availability data) or finds no matching room types, resulting in `totalCost = 0` → "On request" display.

The property in the screenshot ("3 Bedroomed Holiday House(2A)") is likely a manual-rates property where the room type ID in `rooms[]` state doesn't match what's in the synthetic availability. The room IDs from `amenities.room_types` may use different IDs than what `calculateCost` generates.

**Fix in `src/pages/Booking.tsx`:**
- In the wizard rates fallback path (lines ~768-805), ensure room ID matching accounts for the actual IDs used in `amenities.room_types` (like `wizard-room-{name}`) vs what's passed as `roomTypeId` from URL params
- Add a fallback: if after `calculateCost` completes with `totalCost === 0` but rooms have `base_rate` or `daily_rate` in amenities, compute a simple `rate × nights` total
- Also ensure the `roomTypeId` from RoomShowcase's `handleCheckAvailability` matches the IDs used in synthetic availability generation

### Issue 2: Room Showcase page has no direct "Book" button — only "View Property" fallback

**Root cause:** In `RoomShowcase.tsx` line 989-1010, the button logic shows "Book Now" or "Check Availability" only for NightsBridge, Benson, HotelBeds, Hostfully, or manual-rates properties. The fallback is "View Property" which just navigates back. 

For a Benson property, `handleCheckAvailability` navigates to an `/availability` route. For manual-rates, it either adds to cart (with dates) or navigates back to property page without dates. The problem is that when there are no URL date params, the user is sent back to the property page with `#rooms-section` — effectively doing nothing useful.

**Fix in `src/pages/RoomShowcase.tsx`:**
- For manual-rates properties without dates: instead of redirecting to property page, show a date picker inline or navigate to `Booking.tsx` directly with the room pre-selected
- Ensure the button always says "Book Now" or "Select Dates" for bookable properties (not "View Property")
- For the `handleCheckAvailability` manual-rates path without dates: navigate to `/book/${propertySlug}?roomTypeId=${roomId}&roomTypeName=${roomName}` so the user lands on the booking page and can select dates there

### Issue 3: "Add to Journey" button scrolls to room card but doesn't do anything

**Root cause:** In `StickyBookingCTA.tsx`, when `scrollContext === 'rooms'`, the button shows "Add to Journey" but calls `onBook` which is `handleBookProperty`. In PropertyShowcase, `handleBookProperty` for manual-rates with no booked rooms and multiple rooms just calls `scrollToRooms()` — which is what the user already sees. It's a no-op loop.

**Fix in `src/pages/PropertyShowcase.tsx`:**
- When `handleBookProperty` is triggered while already in the rooms section (for manual-rates, multi-room), open the `QuickBookDrawer` instead of just scrolling
- Alternative: the StickyBookingCTA "Add to Journey" should trigger the QuickBookDrawer directly

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Booking.tsx` | Add fallback rate resolution when synthetic availability room IDs don't match; ensure wizard room IDs are consistent |
| `src/pages/RoomShowcase.tsx` | Fix `handleCheckAvailability` for manual-rates without dates to navigate to booking page instead of looping back; ensure button always shows actionable label |
| `src/pages/PropertyShowcase.tsx` | Fix `handleBookProperty` for multi-room manual-rates to open QuickBookDrawer instead of just scrolling when already at rooms section |

