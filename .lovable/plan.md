

# Fix: Duplicate Physical Rooms on Dashboard (Tidal Pools & Dassiesingel)

## Root Cause

Each room type has TWO physical room entries in `rolos_rooms`:
- One linked to an **active** UPPERCASE type (e.g., "BOSBOK" → active type)
- One linked to an **inactive** Title case type (e.g., "Bosbok" → inactive type)

The Dashboard's `roomsByType` grouping does a name-based fallback: when a room's `room_type_id` doesn't match any active type, it looks up by name. Since "bosbok" matches "BOSBOK", the phantom room gets remapped into the canonical group — giving 2 rooms per type instead of 1.

## Data to Clean

**Dassiesingel** — 4 phantom rooms to delete (linked to inactive types):
- Bosbok, Dassie, Grysbok, Steenbok

**Tidal Pools** — 4 phantom rooms to delete (linked to inactive types):
- Elf, Geelstert, Leervis, Wildeperd

Also delete the 8 inactive room types (the Title case / duplicate ones) to prevent re-creation.

## Code Fix

In `src/pages/pms/PMSDashboard.tsx`, update the `roomsByType` grouping to skip rooms whose `room_type_id` points to an inactive/unknown type AND whose name already has a canonical match. This prevents any future phantom rooms from appearing even if database cleanup is missed.

```text
Current logic:
  room → find matching active type by ID → if not found, try by name → group

Fixed logic:
  room → find matching active type by ID → group
       → if not found by ID, check if another room already covers this name → skip duplicate
```

## Steps

1. **Database**: Delete 8 phantom physical rooms from `rolos_rooms`
2. **Database**: Delete 8 inactive duplicate room types from `rolos_room_types`  
3. **Code**: Update `roomsByType` in `PMSDashboard.tsx` to deduplicate rooms mapped by name fallback — keep only one physical room per canonical type name

## Files to Change

| Target | Change |
|--------|--------|
| Database | Delete phantom `rolos_rooms` and inactive `rolos_room_types` for both properties |
| `src/pages/pms/PMSDashboard.tsx` | Filter duplicate rooms in `roomsByType` to prevent name-fallback from doubling units |

