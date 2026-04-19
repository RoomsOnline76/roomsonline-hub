
## Step 3: Property Push — Testing Regime (Jongensfontein)

### Context

- **Buildings ready in RU:**
  - 46905 → SEESIG Chalets
  - 46907 → Dassiesingel Self-ca
  - 46908 → Tidal Pools
  - 46909 → Fonteinhutte
- **Edge function:** `rentalsunited-api`
- **Relevant actions:** `push_property` (XML: `Push_PutProperty_RQ`), `get_property` (`Pull_GetProperty_RQ`), `list_properties` (`Pull_ListOwnerProp_RQ`)
- **Authority model:** per `pms-implementation-master.json` — RU is a distribution adapter (not in master JSON for property authority); local DB remains source of truth. Mappings stored via `pms_mappings` (snake_case keys: `external_id`, `property_id`, `external_system='rentalsunited'`, `mapping_type='building'|'property'`).

### Pre-flight check (read-only)

Before testing, I will quickly verify:
1. `rentalsunited-api/index.ts` exposes `push_property`, `get_property`, `list_properties` actions and a `dry_run` flag (or equivalent) — if `dry_run` is missing, I will add it (compose XML, log it, but skip the HTTP POST).
2. `pms_mappings` table schema confirms snake_case columns.
3. Source property records (Dassiesingel, SEESIG) exist with required RU fields (lat/lng, address, sleeps, currency).

If any required action/flag is missing, the implementation step adds it before tests run.

---

### Test sub-steps

| # | Test | Action | Payload Highlights | Pass Criteria |
|---|------|--------|--------------------|---------------|
| 3.1 | Dry-run single-unit | `push_property` + `dry_run:true` | Property: SEESIG Standard Chalet → Building 46905 | Returns compact XML preview, no HTTP POST to RU, validation passes |
| 3.2 | Dry-run multi-unit | `push_property` + `dry_run:true` | Dassiesingel Studio under Building 46907 with `<NumberOfUnits>3</NumberOfUnits>` | Composition block correct, all required RU fields present |
| 3.3 | Live push (single) | `push_property` | SEESIG single chalet, real POST | RU Status `0`, returns numeric `PropertyID` |
| 3.4 | Verify via `get_property` | `get_property` | Use ID from 3.3 | Returns property with correct `BuildingID=46905`, name, address, sleeps |
| 3.5 | Verify in list | `list_properties` | — | New `PropertyID` present in `properties[]` |
| 3.6 | Authority & mapping | DB read on `pms_mappings` + cache tables | — | Row inserted: `external_system='rentalsunited'`, `external_id=<PropertyID>`, `property_id=<UUID>`, `mapping_type='property'`, snake_case, building mapping linked |

### Failure handling

- Any RU `Status ≠ 0` → halt, capture compact request XML + raw response in diagnostics.
- Any mapping row with camelCase or missing `external_system` → flag as bug; do not proceed to Step 4.

### Implementation deltas (only if missing)

1. **`dry_run` support** in `push_property` handler: short-circuit after XML compose, return `{ success:true, dry_run:true, compact_xml, validation:{...} }`.
2. **Mapping persistence** in `push_property` success path: upsert into `pms_mappings` with snake_case keys after RU returns `PropertyID`.

### Output

Append per-test payload, raw RU XML, status, mapping-row snapshot, and verdict to `/mnt/documents/ru-testing-regime-step3-results.md`. Final summary table:

```text
Test | Property              | Building | RU PropertyID | Status | Mapping Row
3.3  | SEESIG Std Chalet     | 46905    | (new)         | 0      | OK (snake_case)
3.4  | (verify)              | 46905    | (same)        | 0      | —
3.5  | (list contains)       | —        | (same)        | 0      | —
3.6  | pms_mappings audit    | —        | —             | —      | PASS/FAIL
```

### Milestone 3

New RU property created, retrievable, listed, and correctly mapped in `pms_mappings` using snake_case with proper authority boundaries.
