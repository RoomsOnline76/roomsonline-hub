

# Auto-Fill: Multiple Source URLs + Google/TripAdvisor Import

## What changes

### 1. Add two additional URL fields in PropertyForm General tab

Below the existing "Property Website" field, add two more URL inputs labeled "Additional Source URL 1" and "Additional Source URL 2". These are stored in `formData` state as `source_url_2` and `source_url_3` (not persisted to DB — ephemeral scraping sources only used during auto-fill).

### 2. Update Auto-Fill button logic to pass all sources

When the Auto-Fill button is clicked, collect:
- `property_url` (primary website)
- `source_url_2`, `source_url_3` (additional URLs if populated)
- `googlePlaceId` (if captured in the General tab)
- `tripadvisorId` (already passed)

Pass all of these to `syncFromWebsite()`.

### 3. Update `src/lib/api/websiteSync.ts`

Add `additional_urls` (string array) and `google_place_id` to the edge function invocation body.

### 4. Update `supabase/functions/ai-website-sync/index.ts`

- Accept `additional_urls: string[]` and `google_place_id: string` from the request body
- Scrape each additional URL via Firecrawl (same as primary, appended to content)
- If `google_place_id` is provided, fetch place details from Google Places API (New) using `GOOGLE_PLACES_API_KEY` env var — extract description, address, rating, phone, website
- Append Google Places data to the AI extraction prompt alongside TripAdvisor content
- Add `google_` prefixed extraction fields (rating, review count, address) to the tool schema

## Files changed

| File | Change |
|---|---|
| `src/pages/PropertyForm.tsx` | Add `sourceUrl2`/`sourceUrl3` state + input fields below property URL; update Auto-Fill onClick to pass additional URLs and `googlePlaceId` |
| `src/lib/api/websiteSync.ts` | Add `additional_urls` and `google_place_id` params to `syncFromWebsite()` and edge function body |
| `supabase/functions/ai-website-sync/index.ts` | Accept + scrape additional URLs; fetch Google Places details if ID provided; merge all content into AI prompt |

## What does NOT change
- No database migrations (additional URLs are ephemeral, not stored)
- TripAdvisor scraping logic unchanged (already works)
- WebsiteSyncModal unchanged
- No routing changes

