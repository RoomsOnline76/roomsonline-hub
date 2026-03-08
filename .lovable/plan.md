

# ROL'OS PMS Module — Full Review, Bug Report & Technical Spec

## Scope
1. Review all 9 PMS sub-pages + layout + sidebar + edge functions
2. Identify bugs and issues
3. Fix all issues found
4. Create comprehensive technical spec as `docs/rolos-pms-module-spec.md`

---

## Bug Report & Issues Found

### BUG 1: PMSHousekeeping — `as any` type casts on Supabase queries
**Files**: `PMSHousekeeping.tsx` lines 116-119
**Issue**: Uses `supabase.from("rolos_rooms" as any)` — these `as any` casts indicate the types file may not reflect these tables. While functional, it suppresses type checking and could mask errors.
**Fix**: Minor — ensure the generated types file includes these tables (it should after migration). The `as any` casts are a workaround but don't cause runtime bugs.

### BUG 2: PMSReports — Bookings filtered by `created_at` instead of `check_in_date`
**File**: `PMSReports.tsx` lines 63-69
**Issue**: The reports page filters bookings by `created_at` date range, not `check_in_date`. This means a booking created in January for a March stay would show in January's revenue, not March's. This is inconsistent with how Revenue Pulse reports (which uses `check_in_date`).
**Fix**: Change the filter from `created_at` to `check_in_date` for revenue/occupancy accuracy.

### BUG 3: PMSReports — Chart data also aggregated by `created_at`
**File**: `PMSReports.tsx` lines 131-169
**Issue**: `chartData` uses `b.created_at?.startsWith(...)` for bucketing. Should use `check_in_date`.
**Fix**: Change to use `check_in_date` for both daily and monthly aggregation.

### BUG 4: PMSDashboard BookingDetail — `toast()` vs `toast.success()/toast.error()`
**File**: `PMSDashboard.tsx` line 1295
**Issue**: Uses bare `toast("Failed to save: ...")` which renders as a neutral toast. Should use `toast.error()` for failures.
**Fix**: Change to `toast.error()`.

### BUG 5: PMSRooms — No edit/delete capability for rooms
**File**: `PMSRooms.tsx`
**Issue**: Rooms can be created and status changed, but there's no way to edit room details (name, floor, type) or delete a room. This is a functional gap.
**Fix**: Add edit dialog and delete button.

### BUG 6: PMSHousekeeping — Cleaning tasks with no active task can't be completed
**File**: `PMSHousekeeping.tsx` lines 298-300
**Issue**: When a room is marked "dirty" but has no cleaning task (e.g., manually set), there's no button to mark the room as clean. Only the "Report Issue" button shows.
**Fix**: Add a "Mark Clean" button for dirty rooms with no active tasks.

### BUG 7: PMSGuests — Guest detail sheet missing `SheetDescription` accessibility
**File**: `PMSGuests.tsx` line 170
**Issue**: Minor — the `SheetDescription` only shows email, but if email is null, the description is empty. Not a breaking bug but could affect screen readers.

### BUG 8: Revenue Pulse — `commission_type` not in bookings select query
**File**: `supabase/functions/revenue-pulse-api/index.ts`
**Issue**: The revenue pulse API selects `commission_type` from bookings, but this column was just added. Need to verify the migration ran. The code itself looks correct — the `listingRevenue` and `pmsRevenue` split logic references `b.commission_type` which should work post-migration.
**Status**: Verify migration applied. Code is correct.

### BUG 9: PMSDashboard — Housekeeping indicators (dirty/maintenance) only show in stat cards if physical rooms exist
**File**: `PMSDashboard.tsx` lines 458-459
**Issue**: `dirty` and `maintenance` counts rely on `rooms.filter(r => r.status === "dirty")`. If the property hasn't set up physical rooms (only room types), these will always be 0. This is by design but could confuse users.
**Status**: By design — document this clearly.

### BUG 10: PMSRatePlans — Inactive plans still show in list
**File**: `PMSRatePlans.tsx` line 218
**Issue**: The query does NOT filter by `is_active`, so deactivated plans show alongside active ones. The toggle works but the full list includes inactive plans without clear visual distinction.
**Fix**: Add visual distinction (muted/strikethrough) for inactive plans, or filter them by default with a toggle.

---

## Implementation Plan

### Task 1: Fix PMSReports date filtering (BUG 2 & 3)
- Change booking query filter from `created_at` to `check_in_date`
- Update chart aggregation to bucket by `check_in_date`

### Task 2: Fix PMSDashboard toast (BUG 4)
- Change `toast("Failed to save: ...")` to `toast.error("Failed to save: ...")`

### Task 3: Add "Mark Clean" button for dirty rooms without tasks (BUG 6)
- In PMSHousekeeping, add a button that sets room status to "available" directly when no cleaning task exists

### Task 4: Add edit/delete capability to PMSRooms (BUG 5)
- Add edit dialog pre-populated with room data
- Add delete confirmation and soft-delete or hard-delete

### Task 5: Visual distinction for inactive rate plans (BUG 10)
- Add opacity/badge for inactive plans in the list

### Task 6: Create `docs/rolos-pms-module-spec.md`
- Comprehensive technical specification covering all 9 modules, routing, data flow, edge functions, integration points with admin/property overview and revenue pulse

---

## Technical Spec Document Outline

The `docs/rolos-pms-module-spec.md` will cover:

1. **Architecture Overview** — PMSLayout, PMSBrandProvider, routing, property resolution
2. **Dashboard** — Calendar grid (week/month), stats, booking lifecycle, restrictions
3. **Rooms** — Physical room inventory, auto-sync from overview, status management
4. **Room Types** — Bidirectional sync with Property Overview, CRUD
5. **Rate Plans** — Pricing models, seasonal rates, room type linking, amenities write-back
6. **Guest CRM** — Profile management, booking history, complaints
7. **Housekeeping** — 3-column board, cleaning tasks, maintenance dockets, room readiness
8. **Reports** — KPIs (Revenue, Occupancy, ADR, RevPAR), charts, CSV export
9. **Branding** — Logo, colours, business identity, VAT, stationery
10. **Integrations** — Direct links, widgets, booking bar, full embed, WordPress, API
11. **Edge Functions** — roomsonline-pms-api capabilities
12. **Commission System** — Dual listing/PMS rates, calculate-commission flow
13. **Revenue Pulse Integration** — How PMS bookings feed into admin dashboards
14. **Security** — RLS policies, role-based access

