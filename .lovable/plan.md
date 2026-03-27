

# Transform TOBI from Chatbot to Intelligent Sales Concierge

## Root Cause of "No Availability" Lie

The edge function `ai-booking-concierge/index.ts` has a critical bug at **line 697**: when the user already has dates selected (`current_dates` is passed as `{check_in: "2025-04-21", check_out: "2025-04-24"}`), the code **ignores them** and generates new date suggestions from the NLP parser. Since "with a pool" has no date info, `generateDateSuggestions` produces fallback dates (next week, +2 weeks, etc.) — and those may not have availability. Meanwhile the user's actual selected dates DO have availability.

## What's Wrong Beyond the Bug

1. **`current_dates` ignored** — the first date range checked should be the user's selected dates
2. **No AI brain** — responses are hardcoded templates (`generateNarrativeResponse`), not Lovable AI. TOBI can't reason about "with a pool" or sell the property
3. **No property knowledge** — TOBI doesn't fetch amenities, description, highlights, or local experiences to answer preference queries
4. **No cross-sell** — when unavailable, TOBI gives up instead of suggesting the same owner's other properties
5. **No upsell intelligence** — when multiple rooms are available, TOBI doesn't explain WHY the premium room is worth it

## Plan

### 1. Fix: Use `current_dates` First (`ai-booking-concierge/index.ts`)

In the main handler (~line 697-756):
- If `current_dates` exists, use it as the **primary** date range (prepend to `dateSuggestions`)
- Only fall back to NLP-generated dates if `current_dates` is missing
- This immediately fixes the "no availability" lie when dates are already selected

### 2. Enrich with Property Context (`ai-booking-concierge/index.ts`)

Expand the property fetch (~line 678) to include:
- `amenities, description, highlights, tagline, city, country, images, owner_id`
- Fetch `local_experiences` for the property
- Fetch `public_properties` for amenity tags (pool, wifi, etc.)

This gives TOBI the knowledge to answer "with a pool" — yes, this property has a pool!

### 3. Replace Template Responses with Lovable AI (`ai-booking-concierge/index.ts`)

Replace `generateNarrativeResponse` (hardcoded strings) with a call to `https://ai.gateway.lovable.dev/v1/chat/completions` using `google/gemini-3-flash-preview`:

**System prompt** instructs TOBI to be a passionate sales concierge who:
- Highlights what's amazing about THIS property (amenities, location, experiences)
- When rooms ARE available: sells the best/most expensive room with enthusiasm, explains why it's special
- When user mentions preferences ("pool", "quiet", "romantic"): confirms the property has it or redirects
- When NO availability: suggests alternative dates that DO work, or offers the owner's other properties
- Speaks with warmth, uses light emoji, creates urgency ("only X units left!")

**Input to AI**: user query + property details (amenities, highlights, city, experiences) + availability results + room types with descriptions

### 4. Cross-Sell Owner's Other Properties (`ai-booking-concierge/index.ts`)

When `suggestions.length === 0` (no availability):
- Query `properties` table for other properties with the same `owner_id`
- Check if those have availability for the same dates
- Include them in the AI prompt so TOBI can say: "SIX on N is fully booked for those dates, but the owner also has [Property X] nearby with availability!"

### 5. Smart Upsell Logic (`ai-booking-concierge/index.ts`)

When multiple room types are available:
- Sort by price descending
- Pass room descriptions/amenities to the AI so it can explain the value ("The Luxury Suite has a private balcony and sea view — totally worth the extra R500/night")
- Mark the most expensive as "recommended" instead of always marking cheapest as "best value"

### 6. Frontend: Pass Property Context to Concierge (`AIConciergePanel.tsx`)

Add optional props for `propertyDescription`, `propertyAmenities`, `propertyCity` to enrich the edge function call. OR — simpler — just let the edge function fetch this server-side (already planned in step 2).

No frontend changes needed beyond what's already there — the narrative_response from AI will be richer automatically.

## Files

| Action | File |
|--------|------|
| Rewrite | `supabase/functions/ai-booking-concierge/index.ts` — fix current_dates priority, add AI narrative, property context enrichment, cross-sell, upsell |

No database changes needed. No frontend changes needed (the richer responses flow through existing `narrative_response` field).

