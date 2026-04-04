

# Enrich Property Showcase Pages with Dynamic Website Content

## The Content Gap

Comparing our EIGHTY2 ON M embed page to the Fluent Living reference, the reference page has these rich content sections that ours lacks entirely:

| Section | Fluent Living | Our Page |
|---------|--------------|----------|
| About this place (bullet highlights + prose) | Rich multi-paragraph | One-liner description |
| "The Space" (detailed room description) | Full paragraph | Missing |
| Amenities grid (49 items with icons) | Comprehensive | 1 facility |
| "The Neighborhood" | 3 paragraphs | Missing |
| "Getting Around" (Car, Uber, Public Transport) | Detailed | Missing |
| "Things to Know" (Digital Nomad info, load shedding) | Detailed | Missing |
| House Rules (check-in/out, max guests) | Displayed | Data exists but not shown |
| Cancellation Policy | Linked | Data exists but not shown |
| Availability Calendar | Interactive month view | Only in embed grid |
| Similar Apartments | 4 cards | We have PropertyRecommendations |

The root cause is two-fold:
1. Our DB has minimal editorial content for most properties (no space_description, neighbourhood, getting_around, things_to_know fields)
2. Even where data exists (house_rules, check-in/out times), the showcase pages don't render it

## Solution: Two-Part Approach

### Part 1 — New Showcase Content Sections (UI Components)

Create 3 new showcase components that render content when available, and gracefully hide when absent:

**A. `SpaceDescription` component** — Renders "The Space" section with detailed room/property description. Sources from `amenities.space_description` field.

**B. `NeighborhoodGuide` component** — Renders "The Neighborhood" and "Getting Around" sections. Sources from `amenities.neighbourhood_description` and `amenities.getting_around` fields.

**C. `HouseRulesSection` component** — Renders "Things to Know" with house rules (check-in/out times, max guests, pets, smoking, cancellation policy). Sources from existing `amenities.house_rules` data that's already in the DB but never displayed.

Add all three to `PropertyShowcase.tsx` and `EmbedProperty.tsx` between the amenities/facilities section and reviews.

### Part 2 — Background Website Content Enrichment (Edge Function Enhancement)

Enhance the existing `ai-website-sync` edge function to extract these new editorial content fields from property websites:

- `space_description` — "The Space" section content
- `neighbourhood_description` — neighborhood/area description  
- `getting_around` — transport and getting around info
- `things_to_know` — special notes, digital nomad info, power backup info, etc.
- `key_highlights` — bullet-point highlights (e.g., "Uninterrupted Fast WiFi", "Rooftop Pool", "100m to Beach")

Add these to `EXTRACTABLE_FIELDS` and update the AI prompt to specifically look for neighborhood, space, and transport content.

### Part 3 — Auto-Enrich Trigger

Create a new edge function `enrich-property-content` that:
1. Takes a property_id and its website_url
2. Scrapes the website using Firecrawl
3. Uses AI to extract the editorial content fields
4. Saves directly to `amenities` JSON (merging, not overwriting)
5. Can be triggered manually from the property edit page or automatically when a property's website URL is first set

Add an "Enrich from Website" button to the property edit page's ROL Spec tab that triggers this on-demand.

## Files to Create/Change

| File | Change |
|------|--------|
| `src/components/showcase/SpaceDescription.tsx` | New — renders "The Space" prose section |
| `src/components/showcase/NeighborhoodGuide.tsx` | New — renders "The Neighborhood" + "Getting Around" |
| `src/components/showcase/HouseRulesSection.tsx` | New — renders house rules, check-in/out, cancellation |
| `src/components/showcase/index.ts` | Export new components |
| `src/pages/PropertyShowcase.tsx` | Add new sections between ProseFacilities and Reviews |
| `src/pages/EmbedProperty.tsx` | Add new sections in the property info area |
| `supabase/functions/ai-website-sync/index.ts` | Add new extractable fields + enhanced prompt |
| `supabase/functions/enrich-property-content/index.ts` | New — dedicated enrichment function using Firecrawl + AI |

## Design Details

### SpaceDescription
- Section heading: "The space"
- Renders multi-paragraph text from `amenities.space_description`
- Falls back to extended `description` if available and > 200 chars
- Same scroll-reveal animation as other sections

### NeighborhoodGuide  
- Two subsections: "The neighborhood" and "Getting around"
- Renders markdown-like content with paragraph breaks
- Only shows subsections that have data

### HouseRulesSection
- Three columns on desktop: "House rules", "Cancellation policy", "Things to know"
- House rules: check-in/out times, max guests, pets, smoking, children
- Sources from existing `amenities.house_rules` object
- Cancellation policy: from `amenities.cancellation_policies` or `rolos_policies`
- Things to know: from `amenities.things_to_know`

### Enrichment Edge Function
- Uses Firecrawl to scrape property website
- Sends scraped markdown to AI (Lovable AI / Gemini) with a structured extraction prompt
- Merges extracted content into property's `amenities` JSON
- Returns a summary of what was extracted
- Idempotent: won't overwrite existing non-empty fields unless forced

