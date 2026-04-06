

# Fix "Add to Stay" — Current Booking Must Be Saved to Itinerary Before Navigating

## Problem
When a user clicks "Extend your journey" or "Add another stay" from checkout, the current booking is only saved to `sessionStorage` — it is **never added to the ItineraryContext**. So when the user picks a second property on the portfolio page, the first booking is effectively lost. Each property starts a completely new booking cycle instead of accumulating stays.

## Root Cause
`addRoom()` in `Booking.tsx` (line 1844) saves form state to `sessionStorage` but never calls `addStay()` from `useItinerary()`. The ItineraryContext is imported (line 31) but unused in this function.

## Fix

### `src/pages/Booking.tsx` — Add current stay to ItineraryContext before navigating

Inside the `addRoom` function (around line 1844), before navigating away:

1. **Call `addStay()`** with the current booking's details (property info, selected rooms, dates, guests, pricing) so the stay is persisted in the itinerary
2. **Prevent duplicates** — check if a stay for this property+dates already exists in the itinerary before adding
3. Build the stay object from existing state variables: `property`, `rooms`, `checkIn`, `checkOut`, `adults`, `children`, `totalCost`, `costBreakdown`, `selectedRateType`

```text
addRoom() flow:
  BEFORE:  save to sessionStorage → navigate away (stay lost)
  AFTER:   save to sessionStorage → addStay() to itinerary → navigate away (stay preserved)
```

### Key details
- The property image can come from `property.images?.[0]` or the hero image
- `property_slug` from `property.slug || id`
- `external_system` from the integration param or property's `external_system`
- Room selections mapped from the `rooms` state array
- Price breakdown from `costBreakdown` / `totalCost`
- Availability status set to `'available'` (user is already on checkout, availability was confirmed)

### Also fix: returning from portfolio to checkout
When the user returns from the portfolio with a second property booking, the new booking page should also `addStay()` its property into the itinerary, and the JourneyBuilder widget should reflect all accumulated stays.

## Files Changed
| File | Change |
|---|---|
| `src/pages/Booking.tsx` | In `addRoom()`: construct stay object from current booking state and call `addStay()` before navigating; add duplicate check |

