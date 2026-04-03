# Fix: Command Centre — Comprehensive Rewrite

## Root Cause Analysis

The previous "fixes" failed because of a fundamental ID mismatch:

- `pms_availability_cache.external_room_type_id` stores **slugs** (e.g. `holiday-house`, `dungeon`, `3-bedroom-house`)
- `rolos_room_types.id` stores **UUIDs**
- The name resolution does `nameMap[rt.id] = rt.name` — mapping UUID to name
- The filter does `inactiveIds.has(r.external_room_type_id)` — checking slug against UUIDs
- **Result**: Nothing ever matches. Names fall through to `slugToTitle()`, and inactive filtering never works.

## Five Fixes

### 1. Room type name resolution + inactive filtering (the real fix)

Build the name map and inactive set indexed by **slug** (derived from `rt.name`), not just by UUID. For each `rolos_room_types` row, add entries for:

- `rt.id` (UUID — for cache entries that use UUIDs)
- `slugify(rt.name)` (e.g. "Dungeon" → `dungeon`, "3 Bedroom House" → `3-bedroom-house`)

Same for `hostfully_room_types`. This way, when the cache has `external_room_type_id = "dungeon"`, the lookup finds the name AND the `is_active` status.

**Inactive room types whose slugified name matches the cache entry will be filtered out.** This removes "Dungeon", "3 Bedroom House", etc.

### 2. Property filter actually filters cards

Currently `filteredProperties` controls which cache data is fetched, but `occupancy` cards always render for ALL `filteredProperties`. The issue is that when `selectedPropertyFilter` is set, `filteredProperties` correctly returns only that property — but the **occupancy cards section** renders all entries in the `occupancy` state array. This actually should work given the current code. The real issue is likely that `filteredProperties` reference changes cause the effect to not re-fire properly (React memoization + array identity). Fix: use `propertyIds` string as the effect dependency instead of the array reference.

### 3. Week paging — trigger live refresh when cache is empty

When navigating to prev/next week and no cache data exists:

- Show a "No cached data — fetching live availability..." message
- Automatically invoke `roomsonline-pms-api` with `get_availability` for the selected date range
- Populate the grid with the live response
- "This Week" button must restore `weekOffset` to 0 AND trigger a re-fetch (currently it does, but the effect dependency on `filteredProperties` array reference may prevent re-fire if the reference hasn't changed)

### 4. Card grouping — portfolio + property type

Fetch `property_portfolio_members` and `property_portfolios` to group occupancy cards:

- Section 1: Each portfolio as a group header, with member properties underneath
- Within each portfolio, sub-group by `property_type` if there are multiple types
- Section 2: "Other Properties" for properties not in any portfolio
- Each section header shows aggregate occupancy

### 5. Restore grid when clicking "This Week"

The bug: clicking prev/next clears `availability` state. Clicking "This Week" sets `weekOffset` to 0, but if it was already 0 before the prev/next clicks changed it, the effect fires. However, the real issue is the effect dependency `[filteredProperties, weekOffset]` — `filteredProperties` is a memoized array that may have a new reference each render due to the filter logic. Fix: use a stable key (comma-joined property IDs) as the actual trigger.

## File Changes


| File                                 | Changes                                                                                                                                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/pages/pms/PMSCommandCentre.tsx` | Rewrite `loadData` name resolution to use slug-based matching; fix inactive filtering; add live-fetch fallback for empty weeks; fix effect dependencies; add portfolio-based card grouping; fix property filter to use stable dependency |


## Technical Detail

```typescript
// Build slug-keyed maps for resolution
function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// For each rolos_room_types row:
nameMap[rt.id] = rt.name;           // UUID key
nameMap[slugify(rt.name)] = rt.name; // slug key
if (!rt.is_active) {
  inactiveIds.add(rt.id);
  inactiveIds.add(slugify(rt.name)); // slug key too!
}
```

This ensures `external_room_type_id = "dungeon"` matches `slugify("Dungeon") = "dungeon"` → filtered out as inactive.  
  
Test this on page after declaring the issue has been fixed