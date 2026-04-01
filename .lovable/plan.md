

# Fix Circular Booking Flow for Manual Rates Properties

## Problem

The booking flow goes in circles: Property → Room Showcase → Property → Room Showcase → ...

**Root cause**: When a user selects dates via the AI Concierge on the property page, dates are stored in `MobileBookingContext` (React state/sessionStorage). When they click a room and land on `RoomShowcase`, the "Select Dates & Book" button calls `handleCheckAvailability()` which only checks **URL search params** for `checkIn`/`checkOut`. Since dates aren't in the URL, it navigates back to the property page with `?selectDates=true`. But the property page **never reads `selectDates`**, so the user just sees the property page again — stuck in a loop.

## Fix (2 changes in 1 file)

### 1. RoomShowcase: Read dates from MobileBookingContext

Import `useMobileBooking` and in `handleCheckAvailability()` for manual rates properties, check MobileBookingContext dates as a fallback when URL params are absent. If dates exist there, add the stay to cart and navigate to checkout — same as the existing "has dates" branch.

### 2. RoomShowcase: Handle the "still no dates" case properly

When neither URL params nor context have dates, instead of navigating to the property page (which creates the loop), navigate directly to `/book/{slug}?roomTypeId=...&roomTypeName=...` — the Booking page which already has an inline date picker built in (added in the previous fix). This breaks the circle by sending the user to a page that can collect dates and complete checkout.

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/RoomShowcase.tsx` | Import `useMobileBooking`, update `handleCheckAvailability` to read context dates, and change no-dates fallback to `/book/` route |

