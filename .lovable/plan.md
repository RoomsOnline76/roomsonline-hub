
Fix plan: make Hostfully availability truly per unit-type (not capped at 1)

What I found
- The latest import did create correct room type totals (e.g. 20, 16, 11), but `hostfully_unit_map` is empty.
- Edge logs show repeated DB errors during unit map writes:
  - `42P10: there is no unique or exclusion constraint matching the ON CONFLICT specification`
- Root cause: code uses `upsert(..., { onConflict: 'hostfully_uid' })`, but `hostfully_unit_map` has no unique constraint on `hostfully_uid`.
- Result: availability fetch falls back to one representative UID per type, so daily availability behaves like 0/1 instead of “open units for that type”.

Implementation plan
1) Add the missing DB uniqueness needed for upsert
- Create a migration to:
  - de-duplicate `hostfully_unit_map` rows safely (defensive)
  - add a unique constraint/index on `(property_id, hostfully_uid)`
- Why composite: safer than global uniqueness and matches property-scoped ingestion.

2) Align ingestion upserts with the new constraint
- Update:
  - `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts`
  - `supabase/functions/hostfully-api/ingestion/writer.ts`
- Change unit-map upserts to:
  - `onConflict: 'property_id,hostfully_uid'`
- Also treat unit-map write failures as real ingestion errors (not just console logs), so “success” can’t hide broken availability again.

3) Prevent stale availability cache from mixing old/new room IDs
- Clear Hostfully availability cache for the property when a building is re-imported:
  - `src/components/pms/HostfullyBuildingImportDialog.tsx`
  - delete from `pms_availability_cache` where `property_id = ... AND system_type = 'hostfully'`
- This avoids old `external_room_type_id` generations lingering after re-import.

4) Backfill existing Hostfully properties
- Run `ingest_building_units` for already imported Hostfully properties to repopulate `hostfully_unit_map`.
- Then run `fetch_availability` once per property to rebuild clean cache with aggregated per-type availability.

5) Verify end-to-end
- DB checks:
  - `hostfully_unit_map` has rows for each Hostfully building
  - unit map count aligns with `hostfully_room_types.total_units`
- API check:
  - `fetch_availability` returns `available_units` that can exceed 1 for multi-unit types
- UI check:
  - `/admin/calendar/accommodation` shows availability per type per day matching expected open-unit counts.

Technical details
- Files to update:
  - `supabase/migrations/<new>_hostfully_unit_map_unique.sql`
  - `supabase/functions/hostfully-api/ingestion/unit-ingestion.ts`
  - `supabase/functions/hostfully-api/ingestion/writer.ts`
  - `src/components/pms/HostfullyBuildingImportDialog.tsx`
- Key SQL shape:
  - dedupe by `(property_id, hostfully_uid)`
  - add unique index/constraint on `(property_id, hostfully_uid)`
