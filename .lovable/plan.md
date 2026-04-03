

# Fix: Command Centre — No Data for Hostfully Properties (ONE46 ON M)

## Root Cause (Verified from Database)

The cache **has data** for ONE46 ON M — 5 rows per day for the current period. The previous diagnosis ("zero cache data") was wrong.

The real problem is an **ID mismatch in the allowlist filter**:

| What | IDs in cache (`external_room_type_id`) | Active `hostfully_room_types` IDs |
|------|----------------------------------------|-----------------------------------|
| 2 Bedroom | `c7166dba...` (inactive) | `906e5b8f...` (active) |
| Studio | `5861b321...` (inactive) | `4be87a24...` (active) |
| 1 Bedroom | `97536287...` (inactive) | `f0cde43a...` (active) |

The property was re-synced from Hostfully, creating **new active** room type records with different UUIDs. The cache still references the **old inactive** UUIDs. The Command Centre's allowlist filter (line 283-286) only permits rows whose `external_room_type_id` is in `activeRoomKeys` — so every cache row gets filtered out.

The Calendar page works because it fetches ALL cache rows without this filter and resolves names separately.

## Fix

**File: `src/pages/pms/PMSCommandCentre.tsx`**

Replace the strict ID-based allowlist with a **name-based matching** approach for PMS cache rows:

1. Build a set of **active room type names** (lowercased) from `hostfully_room_types` and `rolos_room_types`
2. For each cache row, resolve the `external_room_type_id` to a name using `nameMap` (which already maps both old and new IDs)
3. Check if that **name** exists in the active names set — not the ID itself
4. This way, cache row with old ID `c7166dba` → resolves to "2 Bedroom" → matches active room "2 Bedroom" → included

Additionally: include inactive `hostfully_room_types` in the `nameMap` (they already are on line 222-231, but not added to any name-based lookup). The key change is the filter logic.

```typescript
// Build active NAMES set (lowercased) instead of active IDs set
const activeRoomNames = new Set<string>();

for (const rt of hostfullyResult.data || []) {
  nameMap[rt.id] = rt.name;  // map ALL IDs (active + inactive) for name resolution
  if (rt.is_active) {
    activeRoomNames.add(rt.name.toLowerCase());
  }
}

// Filter cache rows by resolved name, not by raw ID
const pmsRows = cacheData
  .filter((r) => {
    const extId = r.external_room_type_id || "";
    const resolvedName = nameMap[extId];
    if (!resolvedName) return false;
    return activeRoomNames.has(resolvedName.toLowerCase());
  })
  .map(/* ... same as before ... */);
```

This also fixes the same class of problem for any other property that was re-synced, creating new room type UUIDs.

## Files to Change

| File | Change |
|------|--------|
| `src/pages/pms/PMSCommandCentre.tsx` | Replace ID-based allowlist filter with name-based matching for PMS cache rows |

