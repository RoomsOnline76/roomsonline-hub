## Goal
Let admins look up a Google Place ID by searching a business name, instead of pasting it manually. Add this next to the existing Google Place ID inputs in two places:

1. **Admin → Edit Property → General tab → Offerings frame** (single property Google Place ID field)
2. **Admin → Portfolios → Edit portfolio → Review platforms** (per-property Google Place ID field in the list)

## UX
- Small search icon button next to each Google Place ID input.
- Clicking it opens a dialog:
  - Prefilled query = property name + city/region (when available).
  - Results list: display name, formatted address, "Use this" button.
  - Selecting a result writes the Place ID back into the input and marks the form dirty.
- Empty result state and error toast on failure.

## Backend
New Supabase edge function `search-google-place`:
- POST `{ query: string, locationBias?: {lat, lng, radiusM} }`.
- Uses existing `GOOGLE_MAPS_API_KEY` secret (same key pattern as `sync-property-reviews`).
- Calls `https://places.googleapis.com/v1/places:searchText` with FieldMask `places.id,places.displayName,places.formattedAddress,places.location`.
- Returns `{ results: [{ id, name, address, lat, lng }] }`.
- CORS + surfaces provider status/body on non-OK (per API validation policy).
- Registered in `supabase/config.toml` with `verify_jwt = true` (admin-only usage, called from authenticated client).

## Frontend
- New reusable component `src/components/integrations/GooglePlaceSearchDialog.tsx`:
  - Props: `open`, `onOpenChange`, `initialQuery`, `onSelect(placeId, meta)`.
  - Calls `supabase.functions.invoke('search-google-place', ...)`, decoding `FunctionsHttpError.context` per project standard.
- `src/components/property/GeneralTab.tsx`: add search button next to Google Place input; initial query = `${propertyName} ${city || region || ''}`.
- `src/pages/admin/AdminPortfolios.tsx`: add search button next to each per-property Google Place input in the Review Platforms editor; initial query uses that row's property name.

## Out of scope
- No changes to TripAdvisor ID (still manual).
- No changes to booking flow, portfolios data model, or existing review sync logic.
- No new secrets — reuses `GOOGLE_MAPS_API_KEY`.

## Files
- Create `supabase/functions/search-google-place/index.ts`
- Update `supabase/config.toml` (register function)
- Create `src/components/integrations/GooglePlaceSearchDialog.tsx`
- Edit `src/components/property/GeneralTab.tsx`
- Edit `src/pages/admin/AdminPortfolios.tsx`
