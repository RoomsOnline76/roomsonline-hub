

# Improve Hostfully Sync — Image Import & Data Enrichment

## Problem Summary

The "Sync Hostfully Data" button results in room types having only 0–1 images each (e.g., ONE26 ON M: 8 room types, each with just 1 fallback `pictureLink`). The root causes are:

1. **Wrong photos endpoint in `get_listing_details`**: Uses `/properties/{uid}/photos` (line 1330 of `index.ts`) which likely 404s or returns empty. The correct Hostfully v3 endpoint is `/photos?propertyUid={uid}` (as used in `fetchers.ts`).

2. **Image URL extraction misses `originalImageUrl`**: The `get_listing_details` handler (line 1384-1386) only checks `img.url || img.original || img.pictureLink || img.uri` — but Hostfully's photo API returns `originalImageUrl` as the primary field.

3. **Unit-level photos are sparse**: For building properties, Hostfully stores most photos at the building level (`/photos?propertyUid={buildingUid}`), not at individual unit UIDs. The `fetchUnitDetails` in `unit-ingestion.ts` fetches photos per-unit and gets few/none, then falls back to a single `pictureLink`.

4. **No building-level photo distribution**: When building photos exist but individual units don't have photos, there's no mechanism to distribute building-level photos to room types based on category/caption matching.

## Solution

### 1. Fix `get_listing_details` photos endpoint and extraction

**File**: `supabase/functions/hostfully-api/index.ts` (lines ~1328-1340, ~1384-1387)

- Change `/properties/${propertyUid}/photos` to `/photos?propertyUid=${propertyUid}`
- Add `originalImageUrl` to the image URL extraction chain: `img.originalImageUrl || img.url || img.original || img.pictureLink`

### 2. Add building-level photo fallback to unit ingestion

**File**: `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts`

- After fetching all unit details, check if any room type has < 2 images
- If so, fetch building-level photos via `fetchPhotos(buildingUid, creds)` using the property's `hostfully_property_uid`
- Distribute building photos to room types using caption/category matching:
  - Photos with captions containing room type names (e.g., "Studio", "One bedroom") go to that type
  - Photos categorized as "bedroom", "bathroom", "interior", "living_room", "kitchen" get distributed to all room types that lack images
  - Property/exterior photos remain at property level
- This ensures each room type gets a rich image set even when individual unit photo endpoints return sparse results

### 3. Add building photo fetch to the sync flow

**File**: `src/pages/PropertyForm.tsx` (lines ~944-1110)

- After the per-room `get_listing_details` loop, if room types still have ≤1 image, trigger a building-level photo fetch
- Use `fetchPhotos` via the orchestrator or a new lightweight action to get building photos and merge them into room types

### 4. Improve image deduplication in writer

**File**: `supabase/functions/hostfully-api/ingestion/writer.ts`

- When merging images, normalize URLs before dedup (strip query params, trailing slashes)
- Preserve image order/category metadata

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/index.ts` | Fix photos endpoint URL and add `originalImageUrl` extraction |
| `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts` | Add building-level photo fallback: fetch parent property photos and distribute to room types by caption/category matching |
| `src/pages/PropertyForm.tsx` | Remove DEBUG toasts; after per-room sync, check image counts and trigger building photo distribution if needed |

