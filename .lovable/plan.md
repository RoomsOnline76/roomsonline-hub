

## Hostfully Room Type Categorization and Calendar Grouping

### Problem
Hostfully units like "101 Studio", "103 Studio", "104 Compact Studio", "105 Urban Pod" are individual listings. Currently they appear as flat rows in the calendar. The user wants:
1. The room type category ("Studio", "Compact Studio", "Urban Pod") to be extracted and stored during import
2. The calendar to show collapsible group rows for each category
3. Collapsed view shows aggregated availability (total units of that type)
4. Expanded view shows individual units

### Data Analysis
Current `hostfully_room_types` data shows the pattern clearly:
- "101 Studio", "103 Studio", "109 Studio" -> category: **Studio**
- "104 Compact Studio", "204 Compact Studio" -> category: **Compact Studio**
- "105 Urban Pod", "106 Urban Pod" -> category: **Urban Pod**
- "202 Compact One bedroom" -> category: **Compact One bedroom**

The `hostfully_room_types` table already has a `property_type` column (currently null for all rows) which is perfect for storing this category.

---

### Implementation Plan

#### 1. Database Migration: Populate `property_type` on `hostfully_room_types`
- No new columns needed -- `property_type` already exists
- Create a one-time migration to backfill existing rows by extracting the category from the name (strip leading digits/unit number)

```text
"101 Studio"           -> property_type = "Studio"
"104 Compact Studio"   -> property_type = "Compact Studio"  
"214 Mini"             -> property_type = "Mini"
```

**Extraction logic**: Strip leading digits and whitespace from the name to derive the category.

#### 2. Ingestion Pipeline Update (`transformers.ts`)
- In `transformRooms()`, extract the room category from the unit name using the same pattern (strip leading unit number)
- Store it as `property_type` on `TransformedRoomData`

#### 3. Writer Update (`writer.ts`)
- Include `property_type` in the room upsert data so it persists on every sync

#### 4. Types Update (`types.ts`)
- Add `property_type?: string` to `TransformedRoomData`

#### 5. Calendar Grouping (`CalendarAccommodation.tsx`)

This is the main UI change. For Hostfully properties:

- **Group PMS room data by `property_type`** (fetched from `hostfully_room_types` when building calendar data)
- **Collapsible group header row**: Shows the category name (e.g., "Studio") with a chevron toggle and aggregated availability (sum of all units of that type per date)
- **Expanded child rows**: Individual unit rows (e.g., "101 Studio", "103 Studio") with their own availability
- **State management**: Add `expandedGroups` state (Set of group names) to track which categories are expanded
- **Availability aggregation**: When collapsed, sum availability across all units in the group per date

The grouping will:
- Fetch `hostfully_room_types` with their `property_type` when loading a Hostfully property
- Build a `Map<string, PMSRoomTypeData[]>` grouping rooms by `property_type`
- Render a group header row (styled differently, with chevron) showing aggregated totals
- On expand, render individual unit rows beneath

#### 6. Fetch Room Categories
- When a Hostfully property is selected in the calendar, query `hostfully_room_types` for that property to get the `property_type` groupings
- Store this mapping alongside the PMS data for use in rendering

---

### Technical Details

**Category extraction regex:**
```typescript
function extractRoomCategory(name: string): string {
  // Strip leading unit number (e.g., "101 Studio" -> "Studio")
  return name.replace(/^\d+\s*/, '').trim() || name;
}
```

**Calendar group rendering structure:**
```text
[v] Studio (3 units)          | 3 | 2 | 3 | ...  <- aggregated availability
    101 Studio                | 1 | 0 | 1 | ...
    103 Studio                | 1 | 1 | 1 | ...
    109 Studio                | 1 | 1 | 1 | ...
[>] Compact Studio (2 units)  | 2 | 1 | 2 | ...  <- collapsed, aggregated
[v] Urban Pod (3 units)       | 3 | 3 | 2 | ...
    105 Urban Pod             | 1 | 1 | 0 | ...
    106 Urban Pod             | 1 | 1 | 1 | ...
    107 Urban Pod             | 1 | 1 | 1 | ...
```

**Files to modify:**
- `supabase/functions/hostfully-api/ingestion/types.ts` -- add `property_type` to `TransformedRoomData`
- `supabase/functions/hostfully-api/ingestion/transformers.ts` -- extract category in `transformRooms()`
- `supabase/functions/hostfully-api/ingestion/writer.ts` -- include `property_type` in upsert
- `src/pages/CalendarAccommodation.tsx` -- grouping logic, collapsible UI, aggregated availability
- New database migration -- backfill existing `property_type` values

