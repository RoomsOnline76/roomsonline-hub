

## Plan: Fix Embed Page ARI Resolution for ROL'OS Properties

### Problem

The embed page (`EmbedProperty.tsx`) only queries `hostfully_room_types.daily_rate` for room pricing. For ROL'OS properties (like Latter Days), this field is only populated for rooms with a simple unit rate. The Dungeon room uses a "Per Person" rate plan (`rolos_rate_plans`) at R650/person, so its `hostfully_room_types.daily_rate` is `null` — rendering it with "—" and no Book button.

The admin calendar resolves rates correctly because it uses the full ROL'OS rate plan pipeline: `rolos_rate_plans` → `rolos_rate_plan_room_types` → `rolos_rate_seasons` → `rolos_rate_prices`.

### Solution

Enhance `EmbedProperty.tsx` to fetch rates from the ROL'OS rate plan system when the property is a ROL'OS property (`is_rol_property = true`).

### Changes to `EmbedProperty.tsx`

1. **Add `is_rol_property` to the property select query** (line 30)

2. **After fetching room types, if `is_rol_property`, also fetch:**
   - `rolos_room_types` for this property (to get the mapping between `hostfully_room_types.linked_rolos_id` and ROL'OS room type IDs)
   - `rolos_rate_plans` + `rolos_rate_plan_room_types` to resolve each room's rate plan and base rate
   - Use the rate plan's `base_rate` and `pricing_model` as fallback when `hostfully_room_types.daily_rate` is null

3. **Update the grid rendering** to use the resolved rate per room type:
   - For rooms with `daily_rate` already set → use as-is
   - For rooms where `daily_rate` is null but a ROL'OS rate plan exists → show the rate plan's `base_rate` with a label indicating the pricing model (e.g., "R650 pp" for per_person, "R2,650" for UnitRate)
   - Show pricing model indicator so guests understand the rate basis

4. **Per-date rate resolution** (future-proofing): Query `rolos_rate_seasons` and `rolos_rate_prices` to show date-specific rates in the grid cells instead of a flat base_rate across all dates. If no season overrides exist (as is the case for Latter Days currently), fall back to the rate plan's `base_rate`.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/EmbedProperty.tsx` | Add ROL'OS rate plan resolution; update grid to show resolved rates with pricing model labels |

### Technical Detail

```text
Data flow:
  hostfully_room_types (room.id) 
    → linked_rolos_id → rolos_room_types.id
    → rolos_rate_plan_room_types.room_type_id 
    → rolos_rate_plans.base_rate + pricing_model

Grid cell display:
  - UnitRate: "R2,650"
  - per_person: "R650 pp"  
  - null rate + null plan: "—" (unchanged)
```

