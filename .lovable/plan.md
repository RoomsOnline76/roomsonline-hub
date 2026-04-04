

# Fix Content Doubling & Add Brand Voice to Enrichment

## Problem 1: Description Doubling

`BuildingIntro` renders `property.description` under "About this place". Then `SpaceDescription` falls back to the same `description` when `space_description` is null (any description > 200 chars). Result: identical text appears twice on the page.

**Fix**: Remove the fallback in `SpaceDescription` — it should only render when `space_description` exists. If there's no enriched content, the section simply doesn't show (BuildingIntro already covers the base description).

## Problem 2: Enrichment Lacks Brand Voice

The `enrich-property-content` edge function extracts dry factual content. Each property already has a `brand_voice` in `rolos_experience_configs` (e.g., "Warm, coastal, family-friendly. Dassiesingel is a peaceful self-catering retreat near the sea..."). This should be fed into the AI prompt so the enriched `space_description` is rewritten with the property's personality — not just scraped verbatim.

**Fix**: Fetch the property's `brand_voice` from `rolos_experience_configs` and inject it into the extraction prompt, instructing the AI to rewrite (not just extract) the space description in that voice.

## Changes

### 1. `src/components/showcase/SpaceDescription.tsx`
- Remove the description fallback: change line 11 from `spaceDescription || (description && description.length > 200 ? description : null)` to just `spaceDescription`
- Remove the `description` prop entirely — component only renders enriched content

### 2. `src/pages/PropertyShowcase.tsx`
- Remove the `description` prop from `<SpaceDescription>` (line 1053)
- Also remove the duplicate `keyHighlights` rendering — they already appear at line 1002-1011, and `SpaceDescription` also renders them

### 3. `supabase/functions/enrich-property-content/index.ts`
- After fetching property data, also fetch `brand_voice` from `rolos_experience_configs` where `property_id` matches and `experience_type = 'brand_kit'`
- Update the AI prompt to include the brand voice and instruct it to:
  - **Rewrite** (not just extract) the space description in the property's voice/tone
  - Weave in the key highlights naturally
  - Produce evocative, marketing-quality prose — not a dry summary
  - Keep neighbourhood and getting_around factual but warm
- Change `force_overwrite` to also apply when the user explicitly triggers enrichment (so re-running actually updates stale content)

## Files to Change

| File | Change |
|------|--------|
| `src/components/showcase/SpaceDescription.tsx` | Remove `description` fallback; only render when `spaceDescription` exists |
| `src/pages/PropertyShowcase.tsx` | Remove `description` prop from SpaceDescription; remove duplicate key_highlights block |
| `supabase/functions/enrich-property-content/index.ts` | Fetch brand_voice; rewrite AI prompt to produce editorial prose in the property's tone |

