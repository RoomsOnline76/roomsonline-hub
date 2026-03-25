

# Fix Hostfully Ingestion: Description & Facilities Not Mapping

## Root Cause

### 1. Description not written
- `transformDescriptions()` sets `result.description` but does NOT add `'description'` to `lockedFieldNames`
- The description endpoint URL may differ from the working implementation (`/property-descriptions?propertyUid=X` vs `/property-descriptions/{uid}`)
- The working code in `index.ts` also falls back to `property.description || property.summary` before calling the endpoint — the ingestion pipeline doesn't do this fallback

### 2. Facilities not mapped from PMS
- `fetchAvailableAmenities()` calls `GET /available-amenities` — the **master list** of all possible amenities, NOT the property's actual amenities
- The working code in `index.ts` (line 1344) correctly calls `GET /properties/{uid}/amenities` to get the property's own amenities
- Even if the right endpoint were called, Hostfully amenity names (e.g., `WIFI`, `SWIMMING_POOL`, `AIR_CONDITIONING`) don't match ROL facility names (e.g., `Free WiFi`, `Outdoor Swimming Pool`, `Air Conditioning`) — a mapping table is needed

## Changes

### 1. Fix amenity fetcher (`fetchers.ts`)
- Replace `fetchAvailableAmenities()` with `fetchPropertyAmenities(propertyUid, creds)` calling `GET /properties/{propertyUid}/amenities`
- Keep the old function as fallback if the property-specific endpoint returns empty

### 2. Fix description fallback (`fetchers.ts` + `orchestrator.ts`)
- Add fallback: if `/property-descriptions` endpoint returns no description, use `property.description || property.summary` from the core property payload
- Ensure `transformDescriptions()` adds `'description'` to locked fields so it shows as PMS-managed in the form

### 3. Add Hostfully → ROL facility name mapping (`transformers.ts`)
- Add a mapping table from common Hostfully amenity types/names to the exact ROL facility checkbox labels
- `transformAmenities()` will map matched amenities into `facilities` array using ROL names
- Unmatched amenities stored in `amenities.hostfully_raw_amenities` for reference

### 4. Update orchestrator call (`orchestrator.ts`)
- Change `fetchAvailableAmenities(creds)` to `fetchPropertyAmenities(propertyUid, creds)` in the parallel fetch phase

## Files

| Action | File | Purpose |
|--------|------|---------|
| Modify | `supabase/functions/hostfully-api/ingestion/fetchers.ts` | Add `fetchPropertyAmenities(uid)`, fix description fallback |
| Modify | `supabase/functions/hostfully-api/ingestion/orchestrator.ts` | Call property-specific amenities endpoint |
| Modify | `supabase/functions/hostfully-api/ingestion/transformers.ts` | Add amenity name mapping table, mark description as locked field |

