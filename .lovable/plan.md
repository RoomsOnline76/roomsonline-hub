
## Fix multi-stay checkout overwrite in the portfolio/embed journey flow

### What is actually broken
The first stay is being saved into `ItineraryContext` when the user clicks `+` on checkout. The real failure happens later:

1. User starts on legacy single-property checkout: `src/pages/Booking.tsx`
2. `addRoom()` correctly calls `addStay(...)` for the first stay
3. User is routed to the portfolio/embed flow and books a second property
4. That second property still returns to legacy `/booking/:slug`
5. `Booking.tsx` then behaves like a single-property checkout page:
   - restores only the current property’s rooms/price into local state
   - creates payment from local `rooms` / `totalCost`
   - does not switch into journey review/checkout mode
6. Result: only the second stay is used in the booking calculation, while the first stay remains outside the active checkout calculation

So the issue is not just “cart visibility”; it is that the second leg comes back into the wrong checkout flow.

### Implementation approach

#### 1. Route “second stay” returns into the journey flow, not legacy booking
Update the portfolio/embed property booking return path so that when the user is in journey mode, the selected property is added to itinerary and the user is sent to `/journey/review` or `/journey/checkout` instead of another single-property `Booking.tsx` cycle.

Files:
- `src/pages/EmbedPortfolio.tsx`
- `src/pages/EmbedProperty.tsx`

#### 2. Make the journey flag explicit and persistent
Carry a dedicated journey param through the portfolio/embed navigation so the app can reliably distinguish:
- normal single-property booking
- add-another-stay / itinerary flow

This avoids falling back to legacy single-booking behavior after the second property selection.

Files:
- `src/pages/Booking.tsx`
- `src/pages/EmbedPortfolio.tsx`
- `src/pages/EmbedProperty.tsx`

#### 3. Prevent legacy Booking page from acting like final checkout for multi-stay journeys
Harden `Booking.tsx` so that if there is already an itinerary with multiple stays, it does not silently continue as a single-stay payment flow. Instead it should route the user to the journey review flow after preserving the current stay.

This is the guardrail that stops the regression from happening again.

Files:
- `src/pages/Booking.tsx`

#### 4. Ensure the current stay is updated, not duplicated
Refine the duplicate check in `addRoom()` so the current property/date combination is updated or replaced if needed, rather than risking stale or partial entries when the user re-enters checkout.

File:
- `src/pages/Booking.tsx`

#### 5. Make the itinerary visible in embed checkout flows
Right now standard `PublicLayout` shows the JourneyBuilder, but embed flows use `WhiteLabelLayout`, which has no journey/cart surface. Add a minimal compatible cart/journey entry point for white-label/embed checkout so users can verify both stays are present before payment.

File:
- `src/components/layout/WhiteLabelLayout.tsx`

## Expected result
After the fix:

- Stay 1 is preserved when user clicks `+`
- User can book stay 2 from the portfolio
- Returning from the second property no longer restarts single-property checkout logic
- Review/checkout uses the full itinerary total
- Both stays are visible in the cart/timeline before payment

## Files to change
- `src/pages/Booking.tsx`
- `src/pages/EmbedPortfolio.tsx`
- `src/pages/EmbedProperty.tsx`
- `src/components/layout/WhiteLabelLayout.tsx`

## Technical notes
- Root cause is flow orchestration, not just `sessionStorage`
- `ItineraryContext` already supports accumulating stays correctly
- Current regression comes from mixing the itinerary flow with the legacy single-property checkout/payment mutation
- The safest fix is to force multi-stay journeys onto `/journey/review` and `/journey/checkout` once a second stay is being added
