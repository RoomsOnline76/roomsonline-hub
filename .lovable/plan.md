

# Fix "Add Another Destination" Routing and Benson R 0 Pricing

## Two bugs

### Bug 1: "Add Another Destination" goes to `/` instead of portfolio
In `JourneyReview.tsx` line 147, the button navigates to `'/'` — the homepage. It should route to the portfolio showcase page so the user can browse and add another property from the same portfolio.

**Fix**: Derive the portfolio slug from the first stay's context (or from itinerary metadata) and route to `/embed/portfolio/:slug?journey_mode=true`. Fall back to `/` only if no portfolio context exists.

### Bug 2: Benson stay saved with R 0 price
When the user clicks "+" (extend stay) in `Booking.tsx`, `addRoom()` saves the current booking to the itinerary using `totalCost`. But for Benson properties, the ARI/pricing calculation may not have completed yet (or the cost wasn't passed through URL params), so `totalCost` is `0` at the time `addStay()` is called. The stay gets persisted with R 0.

**Fix**: Before calling `addStay`, check if `totalCost` is 0 but rooms exist. If so, attempt to use the `preSelectedTotalCost` from URL params, or the `embed_rate` multiplied by nights as a fallback. Also, when returning to the journey review, re-validate and update stay prices from cached ARI data.

## Files to change

| File | Change |
|---|---|
| `src/pages/JourneyReview.tsx` | Change "Add Another Destination" button to route to portfolio showcase page with `journey_mode=true`, deriving portfolio slug from stays' metadata |
| `src/pages/Booking.tsx` | In `addRoom()`, use `preSelectedTotalCost` or `embed_rate * nights` as fallback when `totalCost` is 0, so the stay is never saved with a zero price when pricing data exists |
| `src/contexts/ItineraryContext.tsx` | Store portfolio slug in itinerary context so JourneyReview can route back to the correct portfolio |

## Detail

### JourneyReview routing fix
- Extract `portfolio_slug` from the stays (add it to the stay metadata) or resolve it from `property_portfolio_members` table
- Button onClick: navigate to `/embed/portfolio/${slug}?journey_mode=true&checkIn=${lastCheckOut}` 
- If no portfolio found, fall back to `/` with a toast explaining no portfolio is linked

### Benson price fix
In `addRoom()` around line 1890, change:
```
const perRoomTotal = (totalCost || 0) / (roomsWithDates.length || 1);
```
to:
```
const effectiveTotal = totalCost || preSelectedTotalCost || 0;
const perRoomTotal = effectiveTotal / (roomsWithDates.length || 1);
```
And use `effectiveTotal` for the `price_breakdown` fields too. This ensures URL-passed pricing (which Benson/embed flows use) is captured even when local calculation hasn't run.

