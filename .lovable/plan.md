

## Plan: Step 4 — Property Push (New Property) for SEESIG units

### Context recap
- Milestone 2 complete. SEESIG building exists in RU as **ID 46912** (DB property `76f524f3-8229-4097-b45d-18489f897195`).
- `pms_mappings` row for SEESIG building has **empty `unit_type_object_ids`** — `Push_PutBuilding_RS` doesn't return them. This is a hard blocker for unit pushes.
- Adapter (`rentalsunited-api`) already emits XSD-correct `<ObjectTypeID>` after `<PropertyTypeID>` and bedroom CompositionRoomIDs (81/82/…).
- Orchestrator (`push-property-to-ru`) already attaches `object_type_id` per unit by name-matching the building composition.
- **Scope**: SEESIG units only. Other 3 Jongensfontein buildings stay dormant until Milestone 3 of *their* lifecycle.

---

### Pre-flight (must run before 4.1)

**Backfill ObjectTypeIDs for building 46912**
- Verify whether `get_building` action exists in `rentalsunited-api/index.ts`. If absent, add it (read-only `Get_Building_RQ` to RU).
- Call it for ID 46912 → parse `<UnitsComposition>` → array of `{ name, object_type_id }`.
- UPDATE `pms_mappings.metadata.unit_type_object_ids` for SEESIG.
- Sanity-check: every active SEESIG `hostfully_room_types.name` matches a composition entry. Surface unmatched names — these become Step 4 blockers.

**Per-unit RU ID storage**
- SEESIG is multi-unit; each Hostfully room → its own RU `PropertyID`. Add column `rentalsunited_property_id BIGINT` to `hostfully_room_types` (migration). Keeps reads simple and aligns with how `rentalsunited_building_id` already lives on `properties`.

---

### Steps

**4.1 Dry run — single unit**
- Pick the first active SEESIG `hostfully_room_types` row.
- Build the unit payload via existing orchestrator helpers (no RU call).
- Validate: `object_type_id` resolved, `<PropertyTypeID>` set, lat/lng present, bedroom CompositionRoomIDs 81/82/…, image count ≥ 10 from `room_images`.
- Output the prepared XML for inspection. Hard-fail if image count <10.

**4.2 Dry run — multi-unit**
- Repeat 4.1 across **all** active SEESIG units.
- Output a per-unit readiness table: name, object_type_id, image count, bed config, ready/blocked + reason.

**4.3 Live push — first ready single unit**
- Call `rentalsunited-api` action `push_property` with the dry-ran payload.
- Capture returned `PropertyID`. Persist:
  - `hostfully_room_types.rentalsunited_property_id = <PropertyID>` for that unit.
  - Insert `pms_mappings`: `system_type='rentals_united'`, `mapping_type='field_mappings'`, `external_id=<PropertyID>`, `metadata={mapping_kind:'property', authority:'rentals_united', unit_id:<hrt.id>, building_id:46912}`.

**4.4 Verify in RU via `get_property`**
- Call `get_property` for the new PropertyID.
- Diff against pushed payload: name, ObjectTypeID, BuildingID=46912, address, beds, image count.

**4.5 Verify in `list_properties`**
- Call `list_properties`; assert PropertyID appears under building 46912.

**4.6 Data authority & mapping verification**
- Query the new `pms_mappings` row → assert all keys snake_case, `metadata.authority='rentals_united'`, `mapping_kind='property'`.
- Spot-check `room_amenities_cache` / `room_images_cache` for snake_case columns and (where applicable) `source='rentals_united'`.
- Confirm `buildPushPropertyXml` output uses snake_case at the boundary (visual XML check).

**Milestone 3 audit report**
- Pre-flight backfill result (matched/unmatched count).
- 4.1/4.2 readiness table.
- 4.3 push response (PropertyID + XML hash).
- 4.4 get_property diff.
- 4.5 list_properties confirmation.
- 4.6 mapping/cache audit (pass/fail per key).

---

### Files / actions involved
- Possible source edit: `supabase/functions/rentalsunited-api/index.ts` — add `get_building` action if missing.
- Migration: `ALTER TABLE hostfully_room_types ADD COLUMN rentalsunited_property_id BIGINT`.
- Insert tool: backfill SEESIG `unit_type_object_ids`; insert per-unit property mapping after 4.3.
- Edge function calls only beyond that.

### Out of scope (explicit)
- No availability, pricing, discounts, RLNM, reservations, lead polling (Steps 6–11).
- No image uploads to RU (URL references only — assumes images already hosted).
- No update-existing-property flow (Step 5).
- Other 3 Jongensfontein buildings remain untouched.

### Decisions needed before execution

1. **ObjectTypeID backfill method** — recommend: add read-only `get_building` action and backfill (avoids RU duplicate-building risk we hit in Milestone 2).
2. **Per-unit RU ID storage** — recommend: add `rentalsunited_property_id` column to `hostfully_room_types`.
3. **4.3 cutoff if dry runs reveal blockers** — if any SEESIG unit fails image-count or composition match, push only the ready ones and document the rest, OR halt entirely. Recommend: push the ready ones, document the blocked.

