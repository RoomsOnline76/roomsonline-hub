

## Plan: Hostfully Importer — Type-Based Room Import

### Problem
The importer currently creates one `hostfully_room_types` row per physical unit (e.g., 47 rows for SixonN). The calendar, booking, and availability systems then treat each as a separate bookable entity. The correct model is: **room types** (Compact Studio, Studio, One Bedroom, Two Bedroom) with a **unit count** representing total inventory.

### Database Changes

**1. Add `total_units` column to `hostfully_room_types`**
```sql
ALTER TABLE hostfully_room_types ADD COLUMN total_units integer DEFAULT 1;
```

**2. Create `hostfully_unit_map` table**
Maps individual Hostfully unit UIDs back to their room type for availability sync:
```sql
CREATE TABLE hostfully_unit_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id uuid REFERENCES hostfully_room_types(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  hostfully_uid text NOT NULL,
  unit_number text,        -- "104", "108"
  unit_name text,          -- "104 Compact Studio"
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_unit_map_room_type ON hostfully_unit_map(room_type_id);
CREATE INDEX idx_unit_map_property ON hostfully_unit_map(property_id);
```
RLS: same as hostfully_room_types (admin/dev + property access).

### Code Changes

**3. Update `HostfullyBuildingImporter.tsx` — `handleImport()`**

Instead of creating one row per unit, group units by `room_type` (case-insensitive), then:
- Create **one** `hostfully_room_types` row per unique type with `total_units` = count, `name` = type name (e.g., "Compact Studio"), `hostfully_room_id` = first unit's UID (for backward compat)
- Insert **all** individual unit UIDs into `hostfully_unit_map` linked to their room type row

**4. Update importer UI** — Show grouped summary

In the expanded building view, instead of listing individual units, show the aggregated types:
```
Compact Studio [17]  |  Studio [13]  |  One Bedroom [4]  |  Two Bedroom [11]
```

**5. Update `hostfully-api/index.ts` — availability sync**

In the multi-unit availability fetch section (~line 908-970):
- Instead of reading unit UIDs from `hostfully_room_types.hostfully_room_id`, read from `hostfully_unit_map`
- After fetching per-unit calendars, **aggregate by room type**: for each date, sum available units across all units of that type
- Return one `room_type` entry per type with `available_units` = aggregated count

**6. Update `hostfullyBuildingParser.ts`**

Add a helper to the `ParsedBuilding` interface:
```ts
export interface RoomTypeGroup {
  type_name: string;
  unit_count: number;
  unit_ids: string[];       // Hostfully UIDs
  unit_numbers: string[];   // "104", "108", etc.
}
```
Add `groupUnitsByType(building: ParsedBuilding): RoomTypeGroup[]` function.

### Impact on Calendar
The calendar already groups by `property_type` column. With this change, each row in `hostfully_room_types` IS a type, so the calendar naturally shows "Compact Studio", "Studio", etc. The `total_units` column provides the inventory count per date (minus booked/unavailable).

### Impact on Booking
Bookings will be to a **room type** (e.g., "Compact Studio") not a specific unit number. This is the standard hotel model. Unit assignment can happen at check-in.

### Files to Modify
| File | Change |
|------|--------|
| **Migration** | Add `total_units` to `hostfully_room_types`, create `hostfully_unit_map` table |
| `src/lib/hostfullyBuildingParser.ts` | Add `RoomTypeGroup` interface and `groupUnitsByType()` |
| `src/components/pms/HostfullyBuildingImporter.tsx` | Group by type on import; show type summary in UI |
| `supabase/functions/hostfully-api/index.ts` | Read from `hostfully_unit_map` for availability; aggregate by type |

