

# ROL'OS Native PMS Enterprise Implementation Plan

## Current State Assessment

The `roomsonline-pms-api` edge function already exists (1133 lines) with full adapter contract compliance. It reads/writes to shared PMS cache tables (`pms_availability_cache`, `pms_room_types_cache`, `pms_rate_types_cache`, `pms_reservations`). No `rolos_` tables exist yet. The `properties` table has `is_rol_property` flag already in use.

The current adapter supports: `fetch_availability`, `get_room_types`, `get_rate_types`, `get_reservations`, `create_reservation`, `modify_reservation`, `cancel_reservation`, `set_availability`, `set_rates`.

## What Needs to Change

The spec proposes extending ROL'OS from a "cache-backed adapter" into a **full enterprise PMS** with physical room inventory, guest CRM, housekeeping, folios, and reporting — while preserving the adapter contract layer for orchestration compatibility.

## Implementation Phases

### Phase 1: Database Schema (Foundation)
Create all `rolos_` prefixed tables via migration:

**Core Inventory** (3 tables)
- `rolos_rooms` — physical room units with status tracking
- `rolos_room_types` — room type definitions (links to existing cache structure)
- `rolos_rate_plans` — dynamic pricing strategies with day-of-week controls

**Pricing Engine** (2 tables)
- `rolos_rate_seasons` — time-based pricing with GiST exclusion constraint for overlap prevention
- `rolos_rate_prices` — actual rates by room type × season

**Guest Management** (2 tables)
- `rolos_guest_profiles` — property-scoped guest CRM with stay history, preferences, tags
- `rolos_guest_comments` — staff notes per guest/booking

**Reservation Extensions** (1 table + ALTER)
- ALTER `bookings` — add `rolos_guest_id`, `rolos_folio_id`, `rolos_rate_plan_id`, `rolos_room_ids`, `rolos_check_in_time`, `rolos_check_out_time`
- `rolos_booking_rooms` — room assignment tracking per booking

**Financial** (2 tables)
- `rolos_folios` — booking-linked folio with balance tracking
- `rolos_folio_transactions` — charges, payments, refunds, adjustments

**Operations** (3 tables)
- `rolos_housekeeping_tasks` — task queue with assignment and completion
- `rolos_housekeeping_schedules` — recurring task definitions
- `rolos_maintenance_requests` — issue tracking with cost tracking

**Analytics** (1 table)
- `rolos_daily_metrics` — with generated columns for ADR, RevPAR, occupancy rate

**RLS policies** on all tables following existing pattern: owner access via `property_owners` + admin/dev override via `has_role()`.

**Triggers**: `updated_at` auto-update on mutable tables, folio balance recalculation.

### Phase 2: Edge Function Extensions
Extend `roomsonline-pms-api` with new actions (keeping existing ones intact):

**New actions to add:**
- `get_rooms` / `update_room_status` — physical room management
- `create_rate_plan` / `create_rate_season` / `set_rate_prices` — pricing engine
- `check_in` / `check_out` — front desk operations (status transitions + room release + housekeeping task generation)
- `get_folio` / `add_folio_charge` / `process_folio_payment` — financial operations
- `get_housekeeping_board` / `assign_housekeeping_task` / `complete_housekeeping_task` — operations
- `get_daily_metrics` — reporting

**Modify existing `create_reservation`** to optionally create guest profiles and folios when property `is_rol_property`.

### Phase 3: Frontend — PMS Module
New route group under `/pms` with dedicated layout:

```
/pms                    → Dashboard (occupancy, revenue, today's arrivals/departures)
/pms/reservations       → Reservation list with check-in/check-out actions
/pms/reservations/:id   → Detail view with folio, room assignments, guest history
/pms/calendar           → Visual room grid (date × room)
/pms/rooms              → Physical room inventory management
/pms/rate-plans         → Rate plan + season + pricing configuration
/pms/guests             → Guest CRM with search, tags, history
/pms/guests/:id         → Guest profile detail
/pms/housekeeping       → Kanban-style task board
/pms/folio/:bookingId   → Folio detail with transaction log
/pms/reports            → ADR, RevPAR, occupancy charts
```

**Access control**: Protected route, only accessible for properties where `is_rol_property = true`. Visible to property owners + admin/dev.

### Phase 4: Navigation & Integration
- Add PMS section to `AppSidebar` (conditionally shown when user has ROL properties)
- Update `MobileBottomNav` with PMS entry
- Link from existing Property Overview to PMS module
- Ensure booking flow (push-booking, modify-booking, cancel-booking) correctly routes to ROL'OS adapter for ROL properties

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Table prefix | `rolos_` | Clear separation from core ROL tables |
| Guest profiles | Property-scoped | Multi-tenant isolation; same guest at different properties = different profiles |
| Folio system | 1:1 with booking | Simplifies financial tracking; split folios can be added later |
| Rate seasons | GiST exclusion constraint | Database-enforced overlap prevention |
| Housekeeping | Task-based, not schedule-driven initially | Simpler MVP; schedules generate tasks via cron later |
| Daily metrics | Generated columns | ADR/RevPAR/occupancy computed automatically |
| `rolos_guest_comments.created_by` | References `auth.users(id)` | Changed to reference `profiles(id)` instead to avoid auth schema dependency |

## Sequencing

This is a large implementation. Recommended build order:
1. **Database migration** (all tables + RLS + triggers) — single migration
2. **Edge function extensions** — extend existing `roomsonline-pms-api`
3. **PMS Dashboard + Room Management pages** — immediate visual value
4. **Rate Plans + Pricing UI** — enables revenue management
5. **Guest CRM** — enhances guest experience tracking
6. **Housekeeping Board** — operational efficiency
7. **Folio System UI** — financial management
8. **Reports** — analytics layer

## Risks & Mitigations

- **Schema size**: 14 new tables in one migration is large but atomic; rollback is clean
- **Existing adapter**: Changes are additive only; existing actions untouched
- **`bookings` ALTER**: Adding nullable columns to existing table is non-breaking
- **`auth.users` references**: `rolos_guest_comments.created_by` will reference `profiles(id)` instead

