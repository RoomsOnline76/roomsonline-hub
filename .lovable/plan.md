
## Fix "Add Another Destination" still falling back to `/book`

### What I found
- `JourneyReview.tsx` already tries to send users back to `/embed/portfolio/:slug`, but only when `stays[0]?.portfolio_slug` exists.
- If that field is missing, it falls back to `/book`.
- `Booking.tsx` does save `portfolio_slug` when the first stay is added from checkout.
- `EmbedProperty.tsx` journey-mode add-to-itinerary flow does not consistently persist `portfolio_slug`, so portfolio context can be lost once the user adds/returns through the experience-engine flow.
- The current button logic is also too fragile because it depends only on the first stay.

## Implementation plan

### 1. Persist portfolio context reliably
Update the journey add-stay flow so every stay created from the portfolio experience carries the active `portfolio_slug`.

Files:
- `src/pages/EmbedProperty.tsx`
- `src/pages/Booking.tsx` (only if needed to normalize all stay creation paths)
- `src/contexts/ItineraryContext.tsx` (if we store a top-level journey portfolio slug as backup metadata)

### 2. Make JourneyReview resolve the portfolio more robustly
Change the button logic in `JourneyReview.tsx` so it resolves the portfolio slug in this order:
1. any stay in the itinerary with `portfolio_slug`
2. stored journey-level portfolio metadata
3. lookup from the first stay’s `property_id` via portfolio membership
4. only then fall back to `/book`

This removes the current “first stay only” weakness.

File:
- `src/pages/JourneyReview.tsx`

### 3. Preserve journey-mode routing end-to-end
Ensure the portfolio slug and `journey_mode=true` continue to be forwarded whenever the user moves:
- checkout -> portfolio
- portfolio -> property
- property -> journey review

Files:
- `src/pages/EmbedPortfolio.tsx`
- `src/pages/EmbedProperty.tsx`
- `src/pages/Booking.tsx` if any gap remains

### 4. Add a safe fallback message
If no portfolio can be resolved at all, keep the fallback route but show a clear toast explaining that the journey is no longer linked to a portfolio showcase.

File:
- `src/pages/JourneyReview.tsx`

## Expected result
After this fix:
- “Add Another Destination” on `/journey/review` will return to the active portfolio showcase page, not `/book`
- the journey will remain attached to the correct portfolio even after adding/editing later stays
- the fallback to `/book` will only happen for genuinely non-portfolio journeys

## Files likely to change
- `src/pages/JourneyReview.tsx`
- `src/pages/EmbedProperty.tsx`
- `src/pages/EmbedPortfolio.tsx`
- `src/pages/Booking.tsx` (if normalization is needed)
- `src/contexts/ItineraryContext.tsx` (if backup journey metadata is added)

## Technical note
The issue is not that the button route is missing — it is already there. The real bug is that portfolio context is not being preserved robustly enough, so `JourneyReview` thinks it has no portfolio and drops into the `/book` fallback.
