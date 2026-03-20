

# Fix Hostfully Building Import: Type Aggregation & Hyphenated Names

## Problems Identified

### 1. THREE43onB not recognized as a building
Hostfully unit names use hyphens: `THREE43onB 102-1BD`, `THREE43onB 103-Studio`. The parser regex only matches pure tokens like `102` or `2A` — it fails on `102-1BD` because of the hyphen. Result: no room number found, entire name treated as a standalone building per unit.

### 2. SixOnN creates individual room rows instead of type groups
Both `full_ingest_property` (orchestrator → writer) and `ingest_building_units` write **one `hostfully_room_types` row per unit** with `total_units: 1`. The dialog fallback (`createRoomTypesFallback`) correctly groups by type, but gets overwritten by the full ingestion. Current DB shows 189 rows for SixOnN — should be ~4 types. Also, `hostfully_unit_map` has 0 entries for SixOnN, so per-unit availability tracking is broken.

## Changes

### 1. Fix parser to handle hyphens — `src/lib/hostfullyBuildingParser.ts`
In `parsePropertyName()`, before splitting by spaces, replace hyphens between a room number and type with a space:
- `"THREE43onB 102-1BD"` → split token `"102-1BD"` → detect `"102"` prefix + hyphen → room: `"102"`, type: `"1BD"`
- Update regex or add a pre-processing step: if a token matches `^\d+[A-Za-z]?-(.+)$`, split it into room number + type

Also mirror this fix in `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts` (which has its own copy of `parseUnitName`).

### 2. Aggregate units by type in ingestion writer — `supabase/functions/hostfully-api/ingestion/writer.ts`
After collecting all room data in step 5 (lines 167-276):
- Group rooms by normalized `property_type` (room category)
- Write ONE `hostfully_room_types` row per type group with `total_units` = count of units in that group
- Use the first unit's details (description, images, max_guests, etc.) as the representative data
- After writing the aggregated room type row, insert individual entries into `hostfully_unit_map` for each unit UID

### 3. Aggregate in unit-ingestion — `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts`
Same aggregation logic in `ingestBuildingUnits()` step 5 (lines 307-356):
- After fetching all unit details into `allRooms`, group by `property_type`
- Write one `hostfully_room_types` row per type with correct `total_units`
- Write `hostfully_unit_map` entries for each individual unit UID

### 4. Aggregate in dialog fallback — `src/components/pms/HostfullyBuildingImportDialog.tsx`
The `createRoomTypesFallback` already groups correctly — no change needed here. But ensure the `full_ingest_property` call (which currently overwrites the fallback) also respects aggregation.

### 5. Sync `amenities.room_types` with aggregated data
In both writer.ts and unit-ingestion.ts, update the `amenities.room_types` sync to use `numRooms: group.unit_count` instead of `numRooms: 1`.

### Summary of files changed
- `src/lib/hostfullyBuildingParser.ts` — hyphen handling in parser
- `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts` — hyphen handling + type aggregation + unit_map writes
- `supabase/functions/hostfully-api/ingestion/writer.ts` — type aggregation + unit_map writes

