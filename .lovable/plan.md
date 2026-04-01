

# Journey Review Branding + Checkout Stay Removal + Availability Calendar in Date Pickers

## Three Issues

### 1. `/journey/review` Not Branded
`JourneyReview.tsx` renders a raw `<div>` with a custom header — no `WhiteLabelLayout` or `PublicLayout`. When a guest arrives via a branded integration flow, there's no visual continuity.

**Fix**: Wrap the page in the same conditional layout pattern used by `Booking.tsx` and `JourneyCheckout.tsx`. Check `sessionStorage` for `brand_override` flag and first stay's property branding. Use `WhiteLabelLayout` when branded, `PublicLayout` otherwise.

### 2. Can't Remove Stays from Checkout (`JourneyCheckout.tsx`)
The booking summary sidebar lists stays read-only — no way to remove one without going back to `/journey/review`. 

**Fix**: Add a small `X` button next to each stay in the checkout summary. Wire it to `removeStay` from `useItinerary()`. If the last stay is removed, redirect back to `/journey/review`. Show a brief toast confirmation.

### 3. No Availability/Cost Calendar in Booking Date Pickers
The `BottomSheetDatePicker` already supports `availabilityMap` (shows rates + blocked dates), and `PropertyShowcase` fetches a 90-day availability map. But `Booking.tsx` uses a plain `CalendarComponent` with no availability data — guests can't see pricing or blocked dates.

**Fix**: Replace the plain `CalendarComponent` range picker in `Booking.tsx` (Step 1 date selection) with the `BottomSheetDatePicker`, passing the property's availability map. This requires fetching availability in `Booking.tsx` the same way `PropertyShowcase` does (query `property_availability` table + manual rates fallback).

## Files

| Action | File | What |
|--------|------|------|
| Modify | `src/pages/JourneyReview.tsx` | Wrap in `WhiteLabelLayout`/`PublicLayout` based on brand override state |
| Modify | `src/pages/JourneyCheckout.tsx` | Add remove button per stay in summary sidebar, import `removeStay` |
| Modify | `src/pages/Booking.tsx` | Replace plain calendar with `BottomSheetDatePicker`, fetch availability map from `property_availability` table |

