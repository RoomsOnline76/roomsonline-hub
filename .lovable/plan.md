
The user wants to re-run Step 3 (Building CRUD) against a clean-slate Rentals United (RU) account, scoped to **SEESIG** building only. All previous building/property IDs in RU have been deleted, so DB state needs reset before re-pushing.

Let me inspect current DB state and the adapter capabilities.
<lov-tool-use id="toolu_vrtx_013homZobaqRvSRhjS99WQhe" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT id, name, rentalsunited_building_id, rentalsunited_property_id, latitude, longitude FROM properties WHERE name ILIKE '%seesig%' OR name ILIKE '%jongensfontein%' ORDER BY name;\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01LvBRCqTLUsGWhdboLaoac9" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT property_id, mapping_type, external_id, metadata FROM pms_mappings WHERE provider = 'rentals_united' AND (metadata->>'mapping_kind' = 'building' OR mapping_type IN ('building','field_mappings'));\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_015CXGonBjYjnddRRJbJ8YX2" name="code--search_files" integration-id="code" data="{\"query\": \"case \\\"(push_building|update_building|list_buildings|get_building)\\\"\", \"include_patterns\": \"supabase/functions/rentalsunited-api/index.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Ecf4cNgFmou2DgRRxP1DxQ" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT id, name, rentalsunited_building_id, rentalsunited_property_id, latitude, longitude FROM properties WHERE name ILIKE '%seesig%' OR name ILIKE '%jongensfontein%' OR name ILIKE '%fontein%' OR name ILIKE '%tidal%' OR name ILIKE '%dassie%' ORDER BY name;\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01S6oDCc9WjwhW5nVzFHk1Ks" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT property_id, mapping_type, external_id, metadata FROM pms_mappings WHERE provider = 'rentals_united';\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01D5LsQJVW5KUfH71k4i16EJ" name="code--search_files" integration-id="code" data="{\"query\": \"case \\\"push_building\\\"|case \\\"update_building\\\"|case \\\"list_buildings\\\"|case \\\"get_building\\\"\", \"include_patterns\": \"supabase/functions/rentalsunited-api/index.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01WHp2n11jSTgXJsjMcF8USv" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT column_name FROM information_schema.columns WHERE table_name='pms_mappings';\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01WurGn1L4xYrp92F3DhNpLU" name="code--search_files" integration-id="code" data="{\"query\": \"push_building|list_buildings|update_building\", \"include_patterns\": \"supabase/functions/rentalsunited-api/**\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01TZeiLbo5v9HUGsCifFE2zE" name="supabase--read_query" integration-id="supabase" data="{\"query\": \"SELECT property_id, system_type, mapping_type, external_id, metadata FROM pms_mappings WHERE system_type = 'rentals_united';\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01QjoUcu3k7eo5RAWPZ2uAF5" name="code--view" integration-id="code" data="{\"file_path\": \"supabase/functions/rentalsunited-api/index.ts\", \"lines\": \"1000-1200\"}">
</lov-tool-use>
I have enough context. The user wants Step 3 (Building CRUD only) re-run from a clean slate. RU was wiped — but DB still has stale building IDs (46907–46911). Need to clear those first, then run focused building tests using SEESIG.
<lov-tool-use id="toolu_vrtx_013w7jZofHKQ8eJSdTwHk4Xc" name="code--search_files" integration-id="code" data="{\"include_patterns\": \"supabase/functions/rentalsunited-api/index.ts\", \"query\": \"buildPushBuildingXml|BuildingName|substring|truncat\"}">
</lov-tool-use>
I have enough to plan. Truncation already exists (line 572: `substring(0, 20)`). The plan is clear: clear stale DB IDs, then run 4 building-only tests via the adapter directly using SEESIG composition.

<lov-plan>

## Plan: Step 3 — Building CRUD Verification (SEESIG only, clean slate)

### Context
- Rentals United has been **wiped clean**. DB still holds stale `rentalsunited_building_id` values (46907, 46908, 46910, 46911) on 4 Jongensfontein properties — these now point to nothing.
- Scope is narrowed to **SEESIG Self Catering CHALETS** (`76f524f3-8229-4097-b45d-18489f897195`) as the test building. Other 3 buildings will only have their stale IDs cleared (no push).
- Adapter already truncates building names to 20 chars (`buildPushBuildingXml`, line 572).
- This is **building-CRUD only** — no property/unit pushes.

### Steps

**1. DB cleanup (clean slate)**
- Migration: clear `rentalsunited_building_id` on the 4 Jongensfontein properties (set to NULL) so re-creation isn't skipped.
- Confirm `pms_mappings` has no `rentals_united` rows (already empty).

**2. Step 3.1 — Create New Building**
- Call `rentalsunited-api` action `push_building` with:
  - `building_name`: "SEESIG Self Catering CHALETS" (will truncate to "SEESIG Self Cateri")
  - `building_id`: 0 (create)
  - `unit_types`: SEESIG composition derived from active `hostfully_room_types` for property `76f524f3…`
- Capture returned `building_id` + `unit_type_object_ids`.
- Persist to `properties.rentalsunited_building_id` and write a `pms_mappings` row (`system_type='rentals_united'`, `mapping_type='field_mappings'`, `metadata.mapping_kind='building'`, `metadata.unit_type_object_ids=[...]`).

**3. Step 3.2 — Update Existing Building**
- Re-call `push_building` with the same name + the `building_id` returned in 3.1.
- Verify response returns the same ID (update path) and Composition is reflected.

**4. Step 3.3 — List Buildings (verify)**
- Call action `list_buildings`. Assert SEESIG appears with the expected ID + truncated name. Log full list for the milestone record.

**5. Step 3.4 — Building Name Truncation test**
- Call `push_building` with a deliberately long throwaway name (e.g. `"ZZ_TEST_TRUNCATION_BUILDING_NAME_VERY_LONG_47_CHARS"`), `building_id: 0`, minimal composition.
- Assert RU stores it as the first 20 chars (`"ZZ_TEST_TRUNCATION_B"`), confirmed by `list_buildings` follow-up.
- Leave the test building in RU (or note ID for manual cleanup); do not write to DB.

**6. Milestone 2 sign-off**
- Produce a short audit report:
  - DB cleanup result
  - 3.1 create response (id, ObjectTypeIDs)
  - 3.2 update response
  - 3.3 list buildings (count + SEESIG row)
  - 3.4 truncation pass/fail
- No unit/property pushes performed — that's Milestone 3.

### Files / actions involved
- DB migration: `UPDATE properties SET rentalsunited_building_id = NULL WHERE id IN (...)` for the 4 Jongensfontein properties.
- Edge function calls only — no source edits to `rentalsunited-api` or `push-property-to-ru` (adapter already correct after last session's fixes).
- Insert one `pms_mappings` row for SEESIG building after 3.1.

### Out of scope (explicit)
- No property/unit pushes (`push_property`).
- No image validation, no pricing, no availability.
- Other 3 Jongensfontein buildings stay dormant until Milestone 3.

