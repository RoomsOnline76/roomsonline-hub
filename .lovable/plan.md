

# ROL'OS PMS Module Completion Plan

## Current State Assessment

The codebase already has significant infrastructure in place:
- **14 `rolos_` tables** already created (rooms, room_types, rate_plans, rate_seasons, rate_prices, guest_profiles, guest_comments, folios, folio_transactions, housekeeping_tasks, housekeeping_schedules, maintenance_requests, daily_metrics, booking_room_assignments)
- **`roomsonline-pms-api`** edge function (1727 lines) with 30+ action handlers including create/modify/cancel reservation, availability, rates, housekeeping, folios, guest CRM, and daily metrics
- **10 PMS UI pages** (Dashboard, Rooms, RoomTypes, RatePlans, Housekeeping, Reports, Guests, Branding, Staff, Integrations)
- Reservations currently use `pms_reservations` cache table -- no dedicated `rolos_reservations` table exists yet
- `push-booking` does NOT call `create_reservation` for ROL properties
- No night audit cron exists
- No pagination on any edge function queries
- `verify_jwt = false` on `modify-booking` and `cancel-booking` (noted in memories as intentional for signing-keys, but should use `getClaims`)

## Phase 1 Implementation Plan

Given the scope, Phase 1 is broken into 7 workstreams. Each delivers independently.

---

### 1.1 Reservation Engine (Operational Layer)

**Database migration:**
- Create `rolos_reservations` table (property_id, booking_id FK, status, check_in, check_out, guest_id FK to rolos_guest_profiles, created_by, confirmation_number, total_amount, currency, special_requests, timestamps)
- Create `rolos_reservation_rooms` table (reservation_id FK, room_type_id FK, room_id FK nullable, adults, children, teens, infants, rate_charged)
- Create `rolos_reservation_status_history` table (reservation_id FK, old_status, new_status, changed_by, reason, timestamp)
- RLS: authenticated users with property access (owner/staff/admin) can CRUD
- Audit trigger on all three tables

**Edge function changes:**
- Update `roomsonline-pms-api` `create_reservation` handler to also insert into `rolos_reservations` + `rolos_reservation_rooms` + status history
- Update `modify_reservation` and `cancel_reservation` to update `rolos_reservations` and log to status history
- Update `push-booking` to detect `is_rol_property` and call `roomsonline-pms-api/create_reservation` for ROL properties (currently missing)

**No UI changes needed** -- the dashboard already reads from `pms_reservations` cache which gets populated.

---

### 1.2 Inventory Calendar

**Database migration:**
- Create `rolos_inventory_calendar` table (property_id, room_type_id, date, total_units, booked_units, blocked_units, available_units as generated column, restrictions JSONB, timestamps)
- Unique index on `(property_id, room_type_id, date)`
- RLS for property access

**Edge function changes:**
- Add `update_inventory` and `check_inventory` actions to `roomsonline-pms-api`
- `update_inventory`: upsert rows in `rolos_inventory_calendar`
- `check_inventory`: query available units for date range (used by availability checks)
- Backfill function: populate from existing room types (total_units = count of rolos_rooms per type)

---

### 1.3 Night Audit Engine

**New edge function:** `pms-night-audit`
- Scheduled via cron at 02:00 SAST daily
- Tasks:
  1. Roll housekeeping: rooms with status `occupied` → set task `dirty` for next day
  2. Finalize occupancy: count checked-in reservations for previous day
  3. Calculate ADR/RevPAR → insert into `rolos_daily_metrics`
  4. Close folios with checkout = yesterday and balance = 0 → set status `closed`
- Add to `config.toml` with `schedule = "0 0 * * *"` (midnight UTC = 02:00 SAST)

---

### 1.4 Pagination & 1000-Row Limit Fix

**Edge function changes:**
- Add `limit` (default 100, max 500) and `offset` (default 0) params to: `get_reservations`, `get_guest_profiles`, `get_housekeeping_board`, `get_daily_metrics`
- Return `{ items: [...], total_count, has_more }` envelope

**Database:**
- Add indexes: `bookings(property_id, check_in_date)`, `rolos_inventory_calendar(property_id, date)` if not present

**Frontend:**
- PMSDashboard calendar: already uses a 30-day window, add "Load More" for bookings exceeding limit
- PMSReports: add cursor-based pagination for booking queries using TanStack Query's `useInfiniteQuery`

---

### 1.5 Security Hardening

**Edge function changes:**
- For `modify-booking` and `cancel-booking`: keep `verify_jwt = false` in config.toml but add `getClaims(token)` validation at the top (already partially done in modify-booking, needs cleanup)
- Add consistent auth validation pattern to all `roomsonline-pms-api` requests (currently uses service role key with no user auth)
- Add request logging: insert summary into `audit_logs` for destructive actions (create/modify/cancel reservation)

**Rate limiting:** Implement a simple in-memory counter per IP per function with 60-req/min threshold, returning 429. No Redis needed for current scale.

---

### 1.6 Scheduled Syncs & Housekeeping Fallback

**New edge function:** `sync-rolos-room-types` (daily cron)
- Query all `is_rol_property` properties
- For each, ensure `rolos_room_types` ↔ `hostfully_room_types` parity (the bidirectional trigger already exists, this is a safety net)
- Auto-create missing `rolos_rooms` entries

**Housekeeping fallback:**
- In `PMSHousekeeping.tsx`: when `rolos_rooms` is empty, derive room list from `rolos_room_types` with synthetic entries (room_number = type name + index)
- Show info banner: "No physical rooms configured. Showing room types as fallback."

---

### 1.7 Type Safety Cleanup

- After all migrations, regenerate types (automatic in Lovable Cloud)
- Refactor PMS pages to remove `as any` casts, using proper types from `src/integrations/supabase/types.ts`
- This is a code-quality pass across all 10 PMS pages

---

## Implementation Order

1. **1.1 Reservation Engine** -- foundation for everything else
2. **1.2 Inventory Calendar** -- needed by night audit
3. **1.4 Pagination** -- database indexes first
4. **1.3 Night Audit** -- depends on 1.1 + 1.2
5. **1.5 Security Hardening** -- applies to all functions
6. **1.6 Syncs & Fallback** -- safety nets
7. **1.7 Type Safety** -- final cleanup pass

## Technical Details

- All new tables follow existing pattern: `id uuid PK default gen_random_uuid()`, `created_at timestamptz default now()`, `updated_at timestamptz default now()`
- All new tables get `update_updated_at_column` trigger and `log_audit_change` trigger
- RLS uses existing `is_property_owner()`, `is_linked_owner()`, and `has_role()` security definer functions
- Edge functions use existing CORS headers and adapter response contract
- Night audit cron uses the same pattern as `daily-health-report`

