

# Fix: Command Centre — 5 Issues

## Problems Found

### 1. Availability grid shows ALL properties, ignores dropdown selection
The Command Centre reads `propertyId` from `searchParams.get("property")` (line 51) but **never uses it to filter**. `loadData()` always fetches cache data for ALL `agentProperties`. When a property is selected in the PMS sidebar dropdown, the grid should show only that property's data.

### 2. Room type names show as UUID/slug IDs instead of human-readable names
The room type resolution (line 103-109) only checks `rolos_room_types` by matching `rt.id` against `external_room_type_id`. But:
- Many cache entries use **slug-based keys** (e.g. `one-bedroom-suite`, `holiday-house`) — not UUIDs
- Many `rolos_room_types` entries are `is_active: false` and excluded from the query
- `hostfully_room_types` is never checked as a fallback
- The `properties.amenities.room_types` JSONB fallback is also missing

The existing `usePropertyRoomTypes` hook already implements the correct 3-level fallback chain. The Command Centre should use a similar approach, plus slug-to-name matching.

### 3. Deleted/inactive room types still appear in the grid
Cache entries for old room types like "3 Bedroom House" and "Dungeon" (Latter Days property) still exist in `pms_availability_cache` even though those `rolos_room_types` rows have `is_active: false`. The grid needs to filter out inactive room types.

### 4. Paging to prev/next week shows no data
`loadData()` runs whenever `agentProperties` or `weekOffset` changes (line 80). The `weekStart`/`weekEnd` calculations (lines 74-76) are correct, but the cache query (lines 95-100) might not have data for those dates. However, the real issue is likely that the effect dependency is on `agentProperties` (the array reference), which doesn't change — and `weekOffset` triggers a re-fetch but the `weekStart`/`weekEnd` values used inside `loadData()` are stale closures because they're calculated outside the effect using the component-level `weekOffset`. Actually, looking again — `weekStart` and `weekEnd` are derived from `weekOffset` at render time, and `loadData` captures them via closure. When `weekOffset` changes, the component re-renders with new `weekStart`/`weekEnd`, then the effect fires `loadData()` which uses the new values. This should work. Let me check if the issue is that the cache simply has no data beyond the current week. More likely: the `rolos_room_types` query has no `is_active` filter, so it might be returning rooms, but the real problem is the room type ID mismatch — rows exist but names don't resolve, making it look empty.

### 5. Occupancy summary cards are unorganized
Currently renders a flat grid of all property cards with no grouping. User wants them grouped by property type or portfolio.

### 6. Portfolio Overview shows blank — doesn't sync from admin
`PMSPortfolio.tsx` fetches portfolios from `property_portfolios` and members from `property_portfolio_members`. The data exists (Jongensfontein has 4 members). The issue is that `PortfolioManager` component only provides a filter selector — it doesn't display portfolio contents. When selecting a portfolio, `filteredProperties` filters by `portfolioMembers`, but these properties must also exist in the `properties` list returned by `usePmsPropertyId`. If the user's properties don't include Dassiesingel, Seesig, etc. (because they're owned by someone else), the filtered list will be empty.

## Plan

### File: `src/pages/pms/PMSCommandCentre.tsx`

**A. Filter by selected property**
- When `propertyId` is set (from URL param / dropdown), filter `loadData()` to only query that property's cache data and only show that property's occupancy card
- When no property selected, show all (current behavior)

**B. Fix room type name resolution**
- After fetching `pms_availability_cache`, collect all unique `(property_id, external_room_type_id)` pairs
- Build a name map using the 3-level fallback: `rolos_room_types` (active + inactive) → `hostfully_room_types` → slug-to-title conversion (e.g. `one-bedroom-suite` → `One Bedroom Suite`)
- Also check `rolos_room_types.is_active` and `hostfully_room_types.is_active` to mark inactive rooms

**C. Filter out inactive/deleted room types**
- After resolving names, exclude rows where the room type exists in `rolos_room_types` with `is_active = false`
- This removes "Dungeon" and other deleted rooms from the grid

**D. Add property dropdown selector**
- Add a `Select` dropdown at the top to pick a specific property or "All Properties"
- Sync with URL param `?property=`

**E. Group occupancy cards**
- Group summary cards by portfolio membership (if portfolios exist) with section headers
- Properties not in any portfolio go under "Other Properties"

### File: `src/pages/pms/PMSPortfolio.tsx`

**F. Fix portfolio property listing**
- The `filteredProperties` depends on `properties` from `usePmsPropertyId()`, which only returns properties the current user owns
- For admin/fearless leader users, this returns all active properties — should work
- For regular owners, portfolio members that belong to other owners won't appear
- Fix: when a portfolio is selected, fetch the member properties directly from the `properties` table by their IDs, regardless of ownership (for display purposes only)

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/pms/PMSCommandCentre.tsx` | Add property filter, fix room type resolution with 3-level fallback, filter inactive rooms, add property selector dropdown, group occupancy cards |
| `src/pages/pms/PMSPortfolio.tsx` | Fix portfolio member listing to fetch properties by ID directly when portfolio is selected |

