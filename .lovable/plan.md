

# Fix Calendar Room Type Units for Hostfully Properties

## Problem
The calendar admin view always shows "1" for available units on Hostfully properties despite correct data in the database.

**Root cause**: The calendar component (`CalendarAccommodation.tsx`) reads `matchingRoom?.units ?? 1` from `amenities.room_types`, but the ingestion pipeline writes the unit count as `numRooms`, not `units`. Since `units` is never set, it always defaults to 1.

## Fix

### 1. CalendarAccommodation.tsx — read `numRooms` as fallback for `units`
**Line 1066**: Change `units: matchingRoom?.units ?? 1` to also check `numRooms`:
```ts
units: matchingRoom?.units ?? matchingRoom?.numRooms ?? 1,
```

**Line 1120** (fallback path): Same fix:
```ts
units: room.units ?? room.numRooms ?? 1,
```

### 2. Writer.ts and unit-ingestion.ts — also write `units` field alongside `numRooms`
In both writer.ts (line 269) and unit-ingestion.ts (line 439), when building the `roomTypesForAmenities` array, add the `units` field:
```ts
units: group.unitUids.length,  // writer.ts
units: room.total_units || 1,  // unit-ingestion.ts
```

This ensures both `numRooms` and `units` are set so the calendar works regardless of which field it reads.

### Files changed
- `src/pages/CalendarAccommodation.tsx` — fallback to `numRooms` when reading units
- `supabase/functions/hostfully-api/ingestion/writer.ts` — write `units` field to amenities
- `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts` — write `units` field to amenities

### Deploy
- Redeploy `hostfully-api` edge function
- Re-import affected buildings to update `amenities.room_types` with `units` field

