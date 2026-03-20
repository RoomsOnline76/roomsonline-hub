

# Fix Room Type Aggregation in Full Ingestion Pipeline

## Root Cause

The `transformRooms()` function in `transformers.ts` (line 351) extracts `property_type` using a naive regex:
```
const roomCategory = resolvedName.replace(/^\d+\s*/, '').trim() || resolvedName;
```

For multi-unit buildings where room names are like "SixOnN 117 Studio" or "THREE43onB 102-1BD", this just strips leading digits — but these names don't start with digits, so `roomCategory` becomes the full name. Every unit gets a unique `property_type`, so the writer's aggregation (which groups by `property_type`) produces one row per unit instead of one row per type.

Meanwhile, the building parser (`parsePropertyName` / `parseUnitName`) correctly extracts types like "Studio", "Compact Studio", "1BD" — but `transformRooms` doesn't use it.

## Fix

### `supabase/functions/hostfully-api/ingestion/transformers.ts`

Add a `parseUnitName` function (copy of the one already in `unit-ingestion.ts`, including hyphen expansion) and use it in `transformRooms()` to extract the room type when the property is multi-unit.

Change line 351 from:
```ts
const roomCategory = resolvedName.replace(/^\d+\s*/, '').trim() || resolvedName;
```
To:
```ts
const parsed = parseUnitName(resolvedName);
const roomCategory = parsed?.type || resolvedName.replace(/^\d+\s*/, '').trim() || resolvedName;
```

This ensures "SixOnN 117 Studio" → type "Studio", "THREE43onB 102-1BD" → type "1BD", and standalone properties with synthetic rooms still fall through to the existing logic.

### Files changed
- `supabase/functions/hostfully-api/ingestion/transformers.ts` — add `parseUnitName` helper + use it in `transformRooms`

### Deploy
- Redeploy `hostfully-api` edge function

### After deploy
- Re-import affected buildings (THREE43onB, SixOnN) to get correct aggregated room types

