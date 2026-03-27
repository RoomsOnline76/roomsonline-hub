

# Google/TripAdvisor Reviews on Property Showcase + Daily Sync

## Overview

This is NOT another PMS adapter — it's a **review aggregation system**. The TripAdvisor API and Google Places API are review data sources, not property management systems. The data flows into a cache table and renders on the showcase page.

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│  Daily Cron (pg_cron)                               │
│  → calls sync-property-reviews edge function        │
│  → fetches TripAdvisor API + Google Places API      │
│  → caches results in property_review_cache table    │
│  → generates TOBI blurb via xAI                     │
└─────────────────────────────────────────────────────┘
         ↓ cached data
┌─────────────────────────────────────────────────────┐
│  PropertyShowcase page                              │
│  ├── RatingBadge (stars + score + count + link)     │
│  ├── ReviewCarousel (3-5 cards with author photos)  │
│  └── TOBI blurb ("Why guests love this place")      │
└─────────────────────────────────────────────────────┘
```

## What Already Exists

- **`tripadvisor-api` edge function** — fetches location details + reviews from TripAdvisor Content API (uses `TRIPADVISOR_API_KEY` from `api_keys` table)
- **`TripAdvisorReviews.tsx` component** — renders reviews but in a heavy card layout, not FluentLiving-style
- **`RunwayReviews.tsx`** — editorial-style review quotes (currently only shows editorial_rating, no live API data)
- **`analyze-reviews` edge function** — AI sentiment analysis, stores `review_sentiment` on properties table
- **`review_platforms` in amenities** — Google (with `place_id`), TripAdvisor, Booking.com already configurable in PMSBranding
- **`GOOGLE_MAPS_API_KEY`** secret — already configured (Google Places API uses the same key)
- **`TRIPADVISOR_API_KEY`** secret — already configured
- **`XAI_API_KEY`** secret — already configured (for TOBI blurb generation)

## Plan

### 1. Database: `property_review_cache` table (Migration)

```sql
CREATE TABLE public.property_review_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE NOT NULL,
  source text NOT NULL, -- 'google', 'tripadvisor', 'booking_com'
  source_id text, -- place_id or tripadvisor location_id
  overall_rating numeric(2,1),
  total_reviews integer DEFAULT 0,
  rating_url text, -- link to full reviews page
  reviews jsonb DEFAULT '[]', -- array of {author, text, rating, date, photo_url, source_url}
  tobi_blurb text, -- AI-generated "why guests love this place"
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(property_id, source)
);
ALTER TABLE public.property_review_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON public.property_review_cache FOR SELECT USING (true);
CREATE POLICY "Service write" ON public.property_review_cache FOR ALL USING (auth.role() = 'service_role');
```

### 2. Edge Function: `sync-property-reviews/index.ts`

Single function that handles both on-demand and cron-triggered syncing:

- **Input**: `{ property_id? }` — if provided, sync one property; if empty, sync all properties with review platform configs
- **For each property**:
  - Read `amenities.review_platforms` and `amenities.external_ids.tripadvisor_id`
  - **TripAdvisor**: call existing `tripadvisor-api` function for details + reviews
  - **Google**: call Google Places API (`https://maps.googleapis.com/maps/api/place/details/json?place_id=X&fields=rating,user_ratings_total,reviews,url&key=GOOGLE_MAPS_API_KEY`)
  - Normalize reviews into `{author, text, rating, date, photo_url, source_url}` format
  - **TOBI blurb**: call xAI with top 5 reviews + property name/city to generate a 2-3 sentence "why guests love this place" summary
  - Upsert into `property_review_cache`

### 3. Daily Cron Job (pg_cron via SQL insert)

Schedule `sync-property-reviews` to run daily at 3am:

```sql
SELECT cron.schedule(
  'sync-property-reviews-daily',
  '0 3 * * *',
  $$ SELECT net.http_post(
    url:='https://qmprswbgkpzcvexmmcbf.supabase.co/functions/v1/sync-property-reviews',
    headers:='{"Content-Type":"application/json","Authorization":"Bearer <anon_key>"}'::jsonb,
    body:='{}'::jsonb
  ) AS request_id; $$
);
```

### 4. Component: `ShowcaseReviewsBadge.tsx`

FluentLiving-style rating badges (like BuildingIntro's facts strip):
- Compact pill badges: Google "G" icon + 4.8 ★ (123 reviews) | TripAdvisor icon + 4.5 (89 reviews)
- Each links to the source review page
- Renders in the `BuildingIntro` section alongside the facts strip

### 5. Component: `ShowcaseReviewCarousel.tsx`

FluentLiving-style horizontal scrolling review cards:
- 3-5 cards showing: author photo (circle avatar, fallback initials), 1-2 line quote, star rating, source badge, date
- Horizontal scroll with snap on mobile, grid on desktop
- Combines reviews from all sources, sorted by date

### 6. TOBI Blurb Section

Below the review carousel, a subtle section:
- TOBI avatar + "Why guests love this place" header
- 2-3 sentence AI-generated blurb from cached `tobi_blurb`
- Styled as a soft card with TOBI branding

### 7. Wire into `PropertyShowcase.tsx`

Replace the current `RunwayReviews` + `TripAdvisorReviews` sections with:
1. `ShowcaseReviewsBadge` in the `BuildingIntro` area
2. `ShowcaseReviewCarousel` + TOBI blurb in place of the current reviews section

Fetch from `property_review_cache` — single fast query instead of live API calls on every page load.

### 8. Hook: `usePropertyReviews.ts`

React Query hook that:
- Fetches from `property_review_cache` for the property
- If cache is empty/stale (>24h), triggers `sync-property-reviews` for this property in background
- Returns `{ badges, reviews, tobiBlurb, isLoading }`

## Files

| Action | File |
|--------|------|
| Create (migration) | `property_review_cache` table |
| Create | `supabase/functions/sync-property-reviews/index.ts` |
| Create | `src/hooks/usePropertyReviews.ts` |
| Create | `src/components/showcase/ShowcaseReviewsBadge.tsx` |
| Create | `src/components/showcase/ShowcaseReviewCarousel.tsx` |
| Modify | `src/components/showcase/BuildingIntro.tsx` — add badge slot |
| Modify | `src/pages/PropertyShowcase.tsx` — replace RunwayReviews/TripAdvisorReviews with new components |
| SQL (insert, not migration) | pg_cron daily schedule |

## Notes

- Google Places API returns max 5 reviews (API limitation) — the daily sync ensures we accumulate over time by appending new unique reviews
- No new API keys needed — `GOOGLE_MAPS_API_KEY` and `TRIPADVISOR_API_KEY` already configured
- The `review_platforms` config in PMSBranding already captures Google `place_id` — we read from there

