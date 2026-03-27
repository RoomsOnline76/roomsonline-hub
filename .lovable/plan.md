

# Three Changes: FluentLiving-Inspired Showcase, RoomShowcase FOUC Fix, TOBI on xAI

## 1. Property Showcase — FluentLiving-Inspired Design Refresh

**What FluentLiving does well** (from the scrape):
- **Gallery**: Large hero image (60% width) + 2x2 grid of smaller images with "+N more" overlay — clean, modern, no carousel buttons visible until hover
- **Property facts row**: Location pin, bedrooms, bathrooms, guests — minimal horizontal strip below gallery
- **Google reviews badge**: Prominent rating card with star display and review count
- **Content sections**: "About this place", "The space", "Amenities" (grid), "The neighborhood", "Getting around", "Things to know" — all with clean typography and generous whitespace
- **Sticky booking sidebar**: Right-aligned, "Book Best Price", "Prices include all fees" tag, clean date pickers
- **"Where you'll be"** map section
- **Similar apartments** row at the bottom

**Changes to PropertyShowcase:**

### File: `src/components/showcase/RunwayHero.tsx`
- Redesign from full-bleed single-image carousel to **FluentLiving-style 1+4 grid**: one large image (left 60%) + 4 smaller images in a 2x2 grid (right 40%), with "+N more" overlay on the last image
- On mobile: keep swipeable carousel (works well)
- Remove heavy gradient overlay — use subtle bottom-only gradient for text legibility

### File: `src/components/showcase/BuildingIntro.tsx`
- Add a horizontal facts strip below the hero (location, bedrooms, bathrooms, guests) — similar to FluentLiving's minimal stats row
- Add Google Reviews badge integration if TripAdvisor data exists (show rating + count prominently)

### File: `src/components/showcase/BookingSidebar.tsx`
- Add "Prices include all fees" tag with price tag emoji
- Style the booking card header as "Book Best Price" instead of generic CTA

### File: `src/components/showcase/ProseFacilities.tsx`
- Present amenities in a grid layout (icon + label) instead of prose paragraphs — matching FluentLiving's clean amenity grid with "Show all N amenities" expandable

These changes keep our existing architecture but refine the visual presentation to feel familiar to the FluentLiving client while being distinctly more polished.

## 2. RoomShowcase FOUC Fix — Loading State Uses Wrong Layout

**Problem**: Lines 468-483 of `RoomShowcase.tsx` — the loading skeleton always renders inside `PublicLayout`, showing ROL branding before the property data loads and `isWhiteLabel` can be evaluated. Same issue on the "Room Not Found" fallback (lines 486-500).

### File: `src/pages/RoomShowcase.tsx`
- Read `brand_override_enabled` from `sessionStorage` (already cached by `useBrandOverride` on the PropertyShowcase page) to determine layout **before** data loads
- If sessionStorage has brand data for this property slug, use `WhiteLabelLayout` for the loading skeleton instead of `PublicLayout`
- Same treatment for the "not found" fallback state
- This mirrors the FOUC pre-paint strategy already used in PropertyShowcase/Booking

## 3. TOBI Concierge — Switch from Lovable AI Gateway to xAI (Grok)

**Current**: `ai-booking-concierge/index.ts` calls `https://ai.gateway.lovable.dev/v1/chat/completions` with `google/gemini-3-flash-preview` for the narrative response generation.

**Change**: Replace the AI gateway call with xAI's API (`https://api.x.ai/v1/chat/completions`) using the existing `XAI_API_KEY` secret and `grok-3-mini-fast` model (same pattern already used in `revenue-pulse-insights` and `dashboard-insights`). Keep the Lovable AI gateway as a fallback if xAI fails.

### File: `supabase/functions/ai-booking-concierge/index.ts`
- In `generateAINarrative` function (~line 418):
  - Primary: call `https://api.x.ai/v1/chat/completions` with `grok-3-mini-fast` using `Deno.env.get("XAI_API_KEY")`
  - Fallback: if xAI fails or key missing, fall back to existing Lovable AI gateway call
  - Keep the same system prompt and user message structure

## Files Summary

| Action | File |
|--------|------|
| Modify | `src/components/showcase/RunwayHero.tsx` — FluentLiving 1+4 gallery grid |
| Modify | `src/components/showcase/BuildingIntro.tsx` — horizontal facts strip + review badge |
| Modify | `src/components/showcase/BookingSidebar.tsx` — "Book Best Price" + fees tag |
| Modify | `src/components/showcase/ProseFacilities.tsx` — amenity grid with expand |
| Modify | `src/pages/RoomShowcase.tsx` — FOUC fix: branded loading skeleton |
| Modify | `supabase/functions/ai-booking-concierge/index.ts` — xAI Grok for TOBI narrative |

No database changes needed.

