## Step 2: Building Creation — Testing Regime (Jongensfontein Portfolio)

### Context Discovered

- **Portfolio:** Jongensfontein.com (`22a7d374-7e2e-4194-8d32-aa870813359e`)
- **4 Properties:** Dassiesingel, Fonteinhutte, SEESIG, Tidal Pools
- **Existing RU buildings (from earlier push has been deletedin RU. Clean Slate**
- **Edge function action:** `push_building` (creates if `building_id=0`, updates if non-zero)
- **RU XML:** `Push_PutBuilding_RQ` with `<BuildingName>` (auto-truncated to 20 chars in code, line 558) and optional `<BuildingComposition>` from `unit_types`
- **Listing:** `list_buildings` → `Pull_ListBuildings_RQ`

### Plan

Execute four test sub-steps via `supabase--curl_edge_functions` against `/rentalsunited-api`. Each test logs the request payload, raw RU XML response, RU status code, and pass/fail verdict.

---

### 3.1 Create New Building — "SEESIG"

**Objective:** Create a brand-new RU building for SEESIG Self Catering Chalets.

**Payload:**

```json
{
  "action": "push_building",
  "building_name": "SEESIG Chalets",
  "building_id": 0,
  "unit_types": [{ "name": "Standard Chalet", "quantity": 4 }]
}
```

**Pass criteria:**

- `success: true`
- `building_id` returned as integer (new ID > 46850)
- RU status `0` (Success)

**Milestone:** New building registered in RU master account.

---

### 3.2 Update Existing Building — "Tidal Pools" (ID 46847)

**Objective:** Confirm idempotent update path by re-pushing an existing building with revised composition.

**Payload:**

```json
{
  "action": "push_building",
  "building_name": "Tidal Pools",
  "building_id": 46847,
  "unit_types": [{ "name": "Apartment", "quantity": 6 }]
}
```

**Pass criteria:**

- `success: true`
- `building_id` returned equals `46847` (no new ID created)
- RU status `0`

**Milestone:** Update path confirmed non-destructive.

---

### 3.3 List Buildings — Verify

**Objective:** Confirm the newly created SEESIG building appears alongside existing buildings.

**Payload:**

```json
{ "action": "list_buildings" }
```

**Pass criteria:**

- `success: true`
- `count` ≥ 5 (4 prior + 1 new SEESIG)
- New SEESIG building ID from 3.1 present in `buildings[]`
- Tidal Pools (46847) name reflects 3.2 update

**Milestone:** Round-trip read-after-write verified.

---

### 3.4 Building Name Truncation (20-char limit)

**Objective:** Verify the code-side truncation in `buildPushBuildingXml` (line 558) prevents RU rejection of long names.

**Payload:**

```json
{
  "action": "push_building",
  "building_name": "Dassiesingel Self-catering Units Premium Collection",
  "building_id": 0,
  "unit_types": [{ "name": "Studio", "quantity": 3 }]
}
```

*(52 chars → must be truncated to first 20: `"Dassiesingel Self-ca"`)*

**Pass criteria:**

- `success: true`
- RU status `0` (no rejection for length)
- `raw_xml` request sent contains `<BuildingName>Dassiesingel Self-ca</BuildingName>`
- `list_buildings` follow-up shows the truncated name exactly

**Milestone:** Truncation guard confirmed; no RU 400-class errors on long input.

---

### Final Verification Query

After all 4 sub-steps, re-run `list_buildings` and produce a summary table:


| RU Building ID | Name                 | Created/Updated     | Step |
| -------------- | -------------------- | ------------------- | ---- |
| (new)          | SEESIG Chalets       | Created             | 3.1  |
| 46847          | Tidal Pools          | Updated             | 3.2  |
| (new)          | Dassiesingel Self-ca | Created (truncated) | 3.4  |


### Failure Handling

If any test returns RU status ≠ 0:

- Capture full `diagnostics` block (compact request XML + parsed status)
- Report status code with RU's documented meaning
- Halt subsequent steps until resolved (do not pollute RU master account with duplicate/broken records)

### Output

A markdown report appended to `/mnt/documents/ru-testing-regime-step2-results.md` containing per-test payload, response, status, and verdict.