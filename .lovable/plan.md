

# Fix: Command Centre — Live Fetch Failures & Stale Cache

## Root Causes Found (from database)

### 1. ONE46 ON M — Zero cache data
Property `464c5d9f` (hostfully) has **no rows at all** in `pms_availability_cache`. The live fetch filter on line 291 correctly identifies it as PMS-backed, but `roomsonline-pms-api` may not handle Hostfully properties — it's a generic dispatcher. The edge function logs show it IS being called for this property, so the issue is likely the API returning empty/error data.

### 2. ONEHUNDRED ON M — Cache exists but stale
Property `a761931e` has cache data last updated **March 25** (9 days ago). The live fetch is only triggered when `rows.length === 0` (line 288), so if there IS cached data (even stale), no live fetch occurs.

### 3. Dassiesingel — ROL'OS property, zero cache, excluded from live fetch
Property `a22384f0` has `external_system: roomsonline`. Line 291 **explicitly excludes** `roomsonline` properties from live fetch (`ext !== "roomsonline"`). It also has zero rows in `pms_availability_cache` AND zero rows in `rolos_inventory_calendar`. Since ROL'OS properties own their own availability data, the Command Centre should read from `rolos_inventory_calendar` or `property_availability` tables instead.

### 4. SIX ON N (roomsonline) — Cache from February 16
The ROL'OS version (`b6ef9ec6`) has cache data from **Feb 16** — nearly 2 months stale.

### 5. Cache freshness indicator missing
When data IS shown, there's no indication of how old it is. The user has no way to know they're looking at 9-day-old data.

## Fix Plan

### File: `src/pages/pms/PMSCommandCentre.tsx`

**Three changes:**

1. **ROL'OS properties: Read from `rolos_inventory_calendar`**
   - For properties with `external_system === "roomsonline"`, query `rolos_inventory_calendar` joined with `rolos_room_types` (active only) instead of `pms_availability_cache`
   - Compute `available_units` as `total_units - booked_units`
   - Merge these rows into the same `availability` state alongside cache rows from PMS properties
   - If `rolos_inventory_calendar` is empty, fall back to `rolos_room_types` with `total_inventory` and assume all available

2. **Per-property live fetch when cache is stale (not just empty)**
   - Change the live fetch trigger from "all rows empty" to "per-property check"
   - For each PMS-backed property, check if its cache data `updated_at` is older than 2 hours
   - If stale OR empty, trigger live fetch for that specific property
   - This replaces the current all-or-nothing approach

3. **Show cache freshness indicator**
   - Add a small badge/timestamp showing "Last updated: X ago" per property in the grid header or occupancy card
   - Color-code: green (<2h), yellow (2-24h), red (>24h)

### Data Flow Summary

```text
Property Type        Data Source               Fallback
─────────────────    ──────────────────────     ────────────────
roomsonline (ROL)    rolos_inventory_calendar   rolos_room_types (total_inventory)
hostfully            pms_availability_cache     roomsonline-pms-api live fetch
other PMS            pms_availability_cache     roomsonline-pms-api live fetch
manual               skip                      skip
```

## Files to Change

| File | Changes |
|------|---------|
| `src/pages/pms/PMSCommandCentre.tsx` | Add ROL'OS inventory calendar query, per-property staleness check, freshness indicator |

