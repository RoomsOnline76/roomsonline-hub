

# Fix: Review Ratings on Portfolio Cards + TripAdvisor Data Issues

## Two Problems Found

### 1. Portfolio cards never show review ratings
`EmbedPortfolio.tsx` has zero reference to reviews, ratings, or `property_review_cache`. The property cards only show name, city, image, price, room count — no guest ratings whatsoever.

### 2. TripAdvisor sync returns empty data for SIX ON N
- TripAdvisor ID `33433520` returns `rating=undefined, reviews=0` from the API
- Google Place ID `2502548` also fails on re-sync (numeric format, but previous cached data from March 27 is preserved)
- The sync function works correctly — it's the IDs that may be wrong or the TripAdvisor Content API may not have data for this location ID
- This is a data/configuration issue, not a code bug — the IDs need to be verified in the property editor

## Plan

### A. Add review rating badges to portfolio property cards

**File: `src/pages/EmbedPortfolio.tsx`**

1. After loading portfolio properties, fetch review ratings from `property_review_cache` for all property IDs in one query
2. Build a map: `propertyId → { source, rating, totalReviews }[]`
3. On each property card, below the city line, render small rating pills:
   - Google pill: Google icon + "4.7 (246)" 
   - TripAdvisor pill: TA icon + "4.5 (89)"
   - Only show pills where `overall_rating > 0`
4. Style: small inline badges with source-specific colors (Google blue, TA green), matching the `EmbedReviewPlatforms` component style

### B. Fix Google Place ID format in sync function

**File: `supabase/functions/sync-property-reviews/index.ts`**

The Google Places API (New) expects IDs like `ChIJ...` but some properties have old numeric IDs (like `2502548`). The sync function should:
1. Detect numeric-only Place IDs
2. For numeric IDs, skip the Places API (New) call and preserve existing cached data
3. Log a warning so admins know the ID needs updating

### C. Add better TripAdvisor error logging

**File: `supabase/functions/sync-property-reviews/index.ts`**

Log the actual API response body when TripAdvisor returns no rating, so we can diagnose whether the location ID is wrong or the API has no data.

## Files to Change

| File | Change |
|------|--------|
| `src/pages/EmbedPortfolio.tsx` | Fetch review cache, render rating pills on property cards |
| `supabase/functions/sync-property-reviews/index.ts` | Handle numeric Google Place IDs gracefully, add TA response logging |

## Technical Notes
- The `property_review_cache` table already has data for properties with valid IDs (SIX ON N has Google 4.7/246 reviews cached)
- Portfolio query is a single SELECT with `property_id IN (...)` — no N+1 queries
- Existing cached review data will display immediately; only future syncs for bad IDs will be affected by the fix

