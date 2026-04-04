

# Enhance Portfolio Page & ROL Property Showcase

## Current State

**Portfolio Page** (`EmbedPortfolio.tsx`) is a functional but basic card grid with:
- Property cards with hero image, name, city, rate, review rating pills
- AI semantic search, groups, bundles, featured picks, specials
- Missing: map, detailed reviews, enriched property descriptions, neighbourhood context

**ROL Property Showcase** (`PropertyShowcase.tsx`) already has rich content sections (SpaceDescription, NeighborhoodGuide, HouseRulesSection, InvitationMap, ReviewCarousel) but the portfolio page and the experience-engine-enabled embed pages don't share these.

**Data availability** for Jongensfontein portfolio:
- All 4 properties have lat/lng coordinates (-34.428, 21.329)
- 3 of 4 have Google review ratings (4.6-4.8)
- None have enriched content yet (no space_description, neighbourhood, highlights)

## Plan

### 1. Portfolio Page: Add Multi-Property Map Section
**File**: `src/pages/EmbedPortfolio.tsx`

- Add a map section below the property grid showing all portfolio properties as pins
- Reuse the Google Maps loading pattern from `InvitationMap` (useGoogleMapsApiKey + importLibrary)
- Each pin shows property name; clicking navigates to that property
- Only render when 2+ properties have coordinates
- Use grayscale map styling consistent with showcase pages

### 2. Portfolio Page: Add Review Carousel Section
**File**: `src/pages/EmbedPortfolio.tsx`

- Fetch reviews from `property_review_cache` (reviews JSON + tobi_blurb) for all member properties
- Add a "What guests are saying" section below the property grid with horizontally scrollable review cards (reuse ShowcaseReviewCarousel pattern but inline-styled for embed context)
- Show review source badges (Google/TripAdvisor/Booking.com) with brand SVG icons
- Aggregate top reviews across all properties, labelling each with the property name

### 3. Portfolio Page: Enrich Property Cards
**File**: `src/pages/EmbedPortfolio.tsx`

- Show enriched descriptions from `amenities.space_description` when available (fallback to current `description`)
- Add key highlight pills if `amenities.key_highlights` exists
- Expand the API (`booking-portfolio-api`) to return `latitude`, `longitude`, `amenities.key_highlights`, and `amenities.space_description` for each property

### 4. Portfolio API: Return Additional Data
**File**: `supabase/functions/booking-portfolio-api/index.ts`

- Add `latitude`, `longitude` to the property select query
- Add a reviews summary fetch (overall_rating, total_reviews, source, tobi_blurb) from `property_review_cache`
- Include top 2 reviews per property in the response
- Return `key_highlights` and `space_description` from property amenities

### 5. ROL Property Showcase: Content Alignment
**File**: `src/pages/PropertyShowcase.tsx`

The showcase already renders SpaceDescription, NeighborhoodGuide, HouseRulesSection, ReviewCarousel, and InvitationMap. The main gap is that non-Hostfully properties skip the BuildingIntro section. Changes:
- Show BuildingIntro for ALL property types (not just Hostfully) — it provides the rich description + review badges header
- Move the review badges into the hero area or building intro universally
- Add key highlights pills section between QuietFacts and rooms (when available from enriched data)
- Display `things_to_know` content more prominently

### 6. Create Portfolio Map Component
**File**: `src/components/embed/EmbedPortfolioMap.tsx` (new)

- Self-contained map component accepting array of `{ name, slug, lat, lng, heroImage }` and brand color
- Renders Google Map with AdvancedMarkerElements for each property
- InfoWindow on click with property name, thumbnail, "View" link
- Grayscale styling matching InvitationMap
- Responsive: full-width, 300px height on mobile, 400px on desktop

### 7. Create Portfolio Reviews Section
**File**: `src/components/embed/EmbedPortfolioReviews.tsx` (new)

- Accepts aggregated reviews with property attribution
- Horizontal scrollable card layout (consistent with ShowcaseReviewCarousel)
- Inline styles (no Tailwind dependency for embed context)
- Shows TOBI blurb summaries when available, attributed to property

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/booking-portfolio-api/index.ts` | Add lat/lng, reviews data, key_highlights, space_description to response |
| `src/pages/EmbedPortfolio.tsx` | Integrate map, reviews section, enriched cards; fetch review details |
| `src/components/embed/EmbedPortfolioMap.tsx` | New: multi-property Google Map for portfolio |
| `src/components/embed/EmbedPortfolioReviews.tsx` | New: aggregated review carousel for portfolio |
| `src/pages/PropertyShowcase.tsx` | Show BuildingIntro for all property types; surface key_highlights universally |

