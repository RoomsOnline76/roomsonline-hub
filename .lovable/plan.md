# Fix Property Pulse "Rooms" count

## Diagnosis (verified against the DB)

- Active properties on the dashboard: **72** ✅ (matches `SELECT count(*) FROM properties WHERE is_active` = 72). The 32 inactive/archived rows are already excluded — no `deleted_at` column exists on `properties`.
- Dashboard "Rooms" today: `sum(GREATEST(1, bedrooms))` over active properties = **268**. That is the `properties.bedrooms` field, which stores "typical bedrooms per unit" and undercounts every multi-unit property.
- Actual room inventory for the same 72 active properties:
  - `rolos_rooms` (physical rooms): **146**
  - `rolos_room_types` (active types, no `total_units` column exists): **166**
  - `hostfully_room_types`: **156**

The property filter is fine — the room number is wrong because it reads the wrong column.

## Fix

In `src/pages/Dashboard.tsx`, replace the `bedrooms`-based room total with a real room count sourced from the same room tables the rest of ROLOS uses. For each active property, pick the first non-zero value from this cascade:

```text
1. rolos_rooms         (count of physical room records for the property)
2. rolos_room_types    (count of active room types — units aren't tracked as a column)
3. hostfully_room_types (count of Hostfully room-type records)
4. properties.bedrooms  (legacy fallback, min 1)
```

Sum those per-property values to produce **Total Rooms** and **Nights denominator** (`totalRooms × dateRange days`). Archived/inactive properties stay excluded because the base `properties` query is already `.eq("is_active", true)`.

### Implementation

1. Add three lightweight parallel queries alongside the existing `dashboard-properties` query, each returning `property_id → count` for active properties only:
   - `rolos_rooms`: `select('property_id')` then group in JS.
   - `rolos_room_types`: `select('property_id').eq('is_active', true)`.
   - `hostfully_room_types`: `select('property_id')`.
   Scope every query to `property_id IN (activePropertyIds)` so RLS + payload stay small.
2. Build a `roomsByProperty: Map<string, number>` using the cascade above.
3. In the `metrics` `useMemo`, replace:
   ```ts
   const totalRooms = relevantProperties.reduce((s, p) => s + Math.max(1, p.bedrooms || 1), 0);
   ```
   with a sum over `roomsByProperty` for the same `relevantProperties`. Everything downstream (ADR, RevPAR, occupancy denominator, "0/xxxx nights" label) keeps using `totalRooms` and self-corrects.
4. Add `roomsByProperty` to the `useMemo` deps.

No schema changes, no other components touched, only the Rooms/nights denominator visibly changes on Property Pulse.

## Verification

- After the change, expect roughly ~166 rooms and `nights ≈ 166 × days_in_selected_range` (e.g. "0/5146" for July 2026) instead of 268 / 8308.
- Spot-check a known multi-unit property (e.g. Jongensfontein members) to confirm its per-property contribution matches its ROLOS room count.
