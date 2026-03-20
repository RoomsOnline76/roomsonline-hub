

# Fix: Orchestrator Creates "Full Property" Instead of Aggregated Types

## Root Cause

The orchestrator (`full_ingest_property`) calls Hostfully's `/multi-units/unit-types` v3 endpoint which **returns 404 for all properties** — it doesn't exist. The orchestrator then falls through to creating a single synthetic "Full Property" room for every property, overwriting any correctly grouped types.

The working path (`ingest_building_units`) — which iterates child UIDs and aggregates by type — is only called from the building import dialog fallback, but the dialog calls `full_ingest_property` first, which "succeeds" with a synthetic room, so the fallback never triggers.

## Fix (3 changes)

### 1. Orchestrator: detect building properties and delegate to unit-ingestion
**File:** `supabase/functions/hostfully-api/ingestion/orchestrator.ts`

After the `/multi-units/unit-types` call returns 404/empty (line 236-240), check if this ROL property has child units in `hostfully_unit_map`. If it does, this is a building — delegate room creation to `ingestBuildingUnits` and skip synthetic room creation.

```
Phase 3 logic:
1. Try /multi-units/unit-types → 404 (as before)
2. NEW: Query hostfully_unit_map for this rolPropertyId
3. If unit_map rows exist → call ingestBuildingUnits() for rooms, skip synthetic
4. If no unit_map rows → check if property has multiple hostfully_room_types already
5. Only create synthetic "Full Property" if truly standalone (no children)
```

### 2. Building import dialog: call `ingest_building_units` instead of `full_ingest_property` for room types
**File:** `src/components/pms/HostfullyBuildingImportDialog.tsx`

Change the import flow to:
1. First call `full_ingest_property` for property-level data (descriptions, photos, rules, amenities) — but tell it to **skip room creation** via a new `skipRooms: true` parameter
2. Then call `ingest_building_units` for proper unit-level room type aggregation

### 3. Add `skipRooms` flag to orchestrator
**File:** `supabase/functions/hostfully-api/ingestion/orchestrator.ts`

Accept optional `skipRooms` boolean. When true, skip phases 3/3.5 (multi-unit fetch and synthetic room) and step 5 in the writer. This lets the dialog use orchestrator for property metadata only, then unit-ingestion for rooms.

### Files changed
- `supabase/functions/hostfully-api/ingestion/orchestrator.ts` — add `skipRooms` param, detect building properties via DB lookup
- `supabase/functions/hostfully-api/index.ts` — pass `skipRooms` from request body to orchestrator
- `src/components/pms/HostfullyBuildingImportDialog.tsx` — call `full_ingest_property` with `skipRooms: true`, then `ingest_building_units`
- `supabase/functions/hostfully-api/ingestion/writer.ts` — respect `skipRooms` flag to skip room writes

### Deploy
- Redeploy `hostfully-api` edge function after changes

