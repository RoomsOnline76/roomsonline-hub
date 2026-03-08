

# Frontend Pagination & Type Safety Cleanup

## Current State
- **PMSReports**: Already has `useInfiniteQuery` pagination -- complete
- **PMSHousekeeping**: Already has fallback logic -- complete
- **PMSDashboard**: Uses `useQuery` for bookings scoped to 30-day window -- low risk of hitting 1000-row limit, but should add pagination guard
- **Type casts (`as any`)**: Found across 8 PMS files, ~121 instances total

## Changes

### 1. PMSDashboard Pagination Guard
The dashboard bookings query (line 306-320) fetches bookings for a 7-30 day window. For busy properties this could exceed 1000 rows. Add `useInfiniteQuery` with auto-fetch-all pattern (fetches all pages automatically on mount, no manual "Load More" needed since the calendar needs all data).

**File**: `src/pages/pms/PMSDashboard.tsx`
- Replace `useQuery` for bookings with `useInfiniteQuery` using PAGE_SIZE=500 and `.range()` pagination
- Flatten pages into single bookings array
- Auto-trigger `fetchNextPage` when `hasNextPage` is true (via `useEffect`)

### 2. Type Safety Cleanup (remove `as any`)

**PMSBranding.tsx** (lines 132, 136, 149, 198):
- Remove `as any` from `supabase.from("rolos_brand_config" as any)` -- table exists in types
- Replace `stationeryRes.data as any` with proper destructuring since the type is known
- Remove `as any` from upsert call

**PMSStaff.tsx** (line 86):
- Remove `setStaff((data as any) || [])` -- `property_staff` Row type matches `StaffMember` interface

**PMSRooms.tsx** (lines 64-65, 82, 96, 106):
- The `(property as any)?.amenities` casts are needed because `amenities` is typed as `Json | null` (generic JSON column). These are **safe to keep** -- the property amenities column is unstructured JSONB.
- Clean the ones that can be typed more precisely

**PMSRatePlans.tsx** (lines 72-75, 119-120, 322-323):
- Same pattern as Rooms -- `amenities` is `Json`, casts are structurally necessary
- Clean `planAny = plan as any` by accessing `.description` directly (it's in the select)

**PMSGuests.tsx** (line 92):
- `profileData.complaints as any[]` -- `complaints` is typed as `Json | null`, cast to `Json[]` instead

**PMSDashboard.tsx** (lines 280, 1449, 1651):
- Line 280: `(rt as any).linked_overview_id` -- this field IS selected but TypeScript doesn't narrow it from the chained query. Keep cast but add comment.
- Line 1449: Error details cast -- necessary, keep
- Line 1651: Form field access via dynamic key -- necessary pattern, keep

**PMSHousekeeping.tsx** (lines 119, 121-122):
- `supabase.from("rolos_rooms") as any` -- these are to avoid TS2589 deep instantiation errors. These are **structural TypeScript limitations** with complex Supabase chains. Keep but add explanatory comments.

### 3. Summary of what gets cleaned vs kept

| File | `as any` count | Removable | Structural (keep) |
|------|---------------|-----------|-------------------|
| PMSBranding | 6 | 6 | 0 |
| PMSStaff | 1 | 1 | 0 |
| PMSRatePlans | 6 | 2 | 4 (Json column) |
| PMSGuests | 1 | 1 | 0 |
| PMSRooms | 6 | 0 | 6 (Json column) |
| PMSDashboard | 3 | 0 | 3 |
| PMSHousekeeping | 3 | 0 | 3 (TS2589) |

**Total**: ~10 `as any` removed, ~16 kept with explanatory comments.

### Implementation Order
1. Add pagination to PMSDashboard bookings query
2. Clean PMSBranding type casts
3. Clean PMSStaff type cast
4. Clean PMSRatePlans (2 removable)
5. Clean PMSGuests type cast
6. Add comments to remaining structural casts

