
## Goal

When editing a ROLOS-PMS property's General tab, give the user a "Search by property name" affordance next to the **HyperGuest Hotel ID** field so they can locate the correct HG ID without having to know it up front.

## Feasibility (HyperGuest side)

HyperGuest does not expose a public "search hotels by name" endpoint, but it does publish the full **static catalogue feed**:

- `GET https://hg-static.hyperguest.com/hotels.json` (already referenced in `supabase/functions/hyperguest-api/index.ts` as `HG_ENDPOINTS.static`, used at lines 490 and 1860).
- Returns the list of hotels visible to the authenticated token, including id, name, address.
- Supplier-side / property-scoped tokens get the full set; pure partner/distributor tokens may receive `401/403` — we already handle that in `healthCheck`.

For our flow this is enough: we fetch the feed once, fuzzy-match by name client-side, and let the user pick the row → the HG ID is written into the existing field.

## Plan

### 1. Backend: new action in `supabase/functions/hyperguest-api/index.ts`

`action: "list_hotels"`:
- Inputs: `{ property_id?: string, query?: string }` (Zod-validated, snake_case at the wire).
- Resolves credentials via existing `resolveCredentials`. Falls back to the configured sandbox key when the property has none — same path the cert portal uses.
- `GET ${HG_ENDPOINTS.static}/hotels.json` with `getAuthHeaders`.
- Normalizes each entry to `{ id, name, city, country }`.
- If `query` is provided: server-side filter by case-insensitive substring + token Jaccard score, return top 25 sorted by score.
- On `401/403/404`: return `{ source: "unavailable", reason, hotels: [] }` so the UI can show a helpful message instead of crashing.
- Otherwise return `{ source: "static", total, hotels }`.
- Logs the call through the existing `logIntegrationStep` helper.

No new tables — the feed is small and gzipped; we keep results in component state only.

### 2. Frontend: new component `src/components/property/HyperGuestPropertyLookup.tsx`

- Props: `propertyId`, `propertyName`, `currentHotelId`, `onSelect(hotelId: string, hotelName: string)`.
- A small popover/sheet triggered by a **Search by name** button next to the HG ID input.
- On open: invokes `hyperguest-api` with `{ action: "list_hotels", query: propertyName }` (debounced 300 ms; user can edit the query).
- Renders a result list: `name — city, country` plus the HG ID; each row has a **Use this ID** button.
- Selecting a row calls `onSelect(...)`, which closes the popover and fills the input.
- Empty / unavailable states:
  - `source: "unavailable"` → "Your HyperGuest token can't list the full catalogue. Ask your HG account manager for the hotel ID, or paste it manually."
  - No matches → "No HyperGuest hotels matched 'X'. Try a shorter query."

### 3. Wire it into `src/components/property/GeneralTab.tsx`

Inside the `selectedPMS === "hyperguest"` block (around lines 455–470), add the lookup button to the right of the existing `Input`:

```tsx
<HyperGuestPropertyLookup
  propertyId={propertyId}
  propertyName={propertyName}
  currentHotelId={hyperguestHotelId}
  onSelect={(id) => { setHyperguestHotelId(id); setIsDirty(true); }}
/>
```

Visible only when `selectedPMS === "hyperguest"`. Disabled (with tooltip) when `propertyId` is empty (i.e. brand-new property not yet saved) since the backend needs a property to resolve credentials.

### 4. No schema or migration changes

The HG ID still lives in its existing column and is still saved through the normal General-tab save flow. The existing `HyperGuestSyncReflectionButton` continues to run once an ID is captured.

## Technical notes

- camelCase only on the HG wire; snake_case on our edge-function boundary (per project API contract memory).
- Reuse `hgFetch`, `getAuthHeaders`, `resolveCredentials`, `logIntegrationStep` — no auth duplication.
- Add a Zod schema to the existing `actionSchemas` block; keep error responses consistent with other actions.
- Component uses existing shadcn `Popover`, `Command`, `Input` primitives — no new design tokens.

## Out of scope

- Auto-running the lookup on tab open (explicit click only — avoids unnecessary HG calls).
- Bulk linking across all properties.
- Storing the catalogue snapshot in a table.
- Changes to the Reflection page (separate effort).
