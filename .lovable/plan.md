

## Plan: Bridge Benson/HotelBeds ARI into the PMS Dashboard

### Root Cause

The PMS Dashboard reads room types, rates, and availability exclusively from the ROL'OS pipeline:
- Room types → `rolos_room_types`
- Rates → `rolos_rate_plans` + `rolos_rate_plan_room_types` + `rolos_rate_seasons`
- Availability → `property_availability`

Benson and HotelBeds adapters write their synced ARI data to `pms_availability_cache` (with `system_type`, `external_room_type_id`, `available_units`, `rates` JSONB, `restrictions` JSONB). **No step exists to hydrate this cached data into the ROL'OS tables that the dashboard reads.** Hostfully works because its adapter writes directly to `hostfully_room_types`, which triggers `sync_overview_to_rolos_room_types()`.

### Solution: Add a cache-to-ROL'OS hydration step in the Benson and HotelBeds adapters

After writing to `pms_availability_cache`, each adapter should also ensure the corresponding room types, rates, and availability exist in the ROL'OS tables so the dashboard can display them.

### Changes

#### 1. New shared function: `hydrate-pms-cache-to-rolos` (edge function)

A reusable edge function that, given a `property_id` and `system_type`:

1. **Room Types**: Reads distinct `external_room_type_id` + room name from `pms_availability_cache.raw_data`. For each, upserts into `hostfully_room_types` (which triggers the existing `sync_overview_to_rolos_room_types` trigger to auto-create `rolos_room_types` + `rolos_rooms`). Stores the PMS external ID mapping in the room type's JSONB field.

2. **Rates**: For each room type, reads the `rates` JSONB array from cache. Creates/updates `rolos_rate_plans` per distinct rate type, links them to room types via `rolos_rate_plan_room_types`.

3. **Availability**: Reads `available_units` and `restrictions` from cache. Writes to `property_availability` (which the dashboard already reads via `overrideMap`).

**File:** `supabase/functions/hydrate-pms-cache-to-rolos/index.ts`

#### 2. Call hydration from Benson adapter

After the `pms_availability_cache` upserts in the `fetch_availability` action (~line 960), invoke the hydration function.

**File:** `supabase/functions/benson-api/index.ts` — add call after cache writes

#### 3. Call hydration from HotelBeds adapter

Same pattern — after cache writes, invoke hydration.

**File:** `supabase/functions/hotelbeds-api/index.ts` — add call after cache writes

#### 4. Dashboard: use `pms_availability_cache` as fallback for rates

Update `getRateForDate` in `PMSDashboard.tsx` to also check `pms_availability_cache` when the ROL'OS rate plan chain returns null. This gives immediate visibility even before hydration completes.

**File:** `src/pages/pms/PMSDashboard.tsx` — extend `getRateForDate` + add cache query

### Data Flow After Fix

```text
Benson/HotelBeds API → pms_availability_cache (existing)
                      → hydrate-pms-cache-to-rolos (new)
                        → hostfully_room_types (upsert)
                          → trigger: sync_overview_to_rolos_room_types
                            → rolos_room_types + rolos_rooms (auto)
                        → rolos_rate_plans + rolos_rate_plan_room_types (upsert)
                        → property_availability (upsert)
                      → Dashboard reads normally from ROL'OS tables ✓
```

### Files to Modify/Create

| File | Change |
|------|--------|
| `supabase/functions/hydrate-pms-cache-to-rolos/index.ts` | **New** — shared hydration logic: cache → hostfully_room_types + rolos_rate_plans + property_availability |
| `supabase/functions/benson-api/index.ts` | Call hydration after cache writes |
| `supabase/functions/hotelbeds-api/index.ts` | Call hydration after cache writes |
| `src/pages/pms/PMSDashboard.tsx` | Add `pms_availability_cache` fallback query in `getRateForDate` for non-ROL properties |

