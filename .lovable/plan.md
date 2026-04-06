

# Show Cart/JourneyBuilder on Booking (Checkout) Page

## Problem
The `Booking.tsx` page passes `hideJourneyBuilder` to `PublicLayout`, which completely suppresses the floating JourneyBuilder widget. When a user has added stays to their itinerary and is on the checkout page, they cannot view their cart or see the calendar timeline of their journey.

## What will be done

Remove `hideJourneyBuilder` from the `PublicLayout` usage in `Booking.tsx` so the floating JourneyBuilder widget appears when the user has stays in their itinerary. The JourneyBuilder already self-hides when there are no stays, so there's no risk of it appearing for single-booking flows with an empty itinerary.

For the `WhiteLabelLayout` path (integration/embed flows), the JourneyBuilder won't appear since that layout doesn't render it — which is correct for embedded contexts.

## Files Changed

| File | Change |
|---|---|
| `src/pages/Booking.tsx` | Remove `hideJourneyBuilder` prop from the `PublicLayout` wrapper (line 2307) |

