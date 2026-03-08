# ROL'OS PMS Module — Technical Specification

> **Version**: 2.0  
> **Last Updated**: 2026-03-08  
> **Module Path**: `/pms/*`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Property Resolution](#2-property-resolution)
3. [Dashboard & Calendar](#3-dashboard--calendar)
4. [Room Inventory](#4-room-inventory)
5. [Room Types](#5-room-types)
6. [Rate Plans & Pricing Engine](#6-rate-plans--pricing-engine)
7. [Guest CRM](#7-guest-crm)
8. [Housekeeping & Maintenance](#8-housekeeping--maintenance)
9. [Property Reports](#9-property-reports)
10. [Branding](#10-branding)
11. [Integrations](#11-integrations)
12. [Edge Functions](#12-edge-functions)
13. [Reservation Engine](#13-reservation-engine)
14. [Inventory Calendar](#14-inventory-calendar)
15. [Night Audit](#15-night-audit)
16. [Commission System](#16-commission-system)
17. [Revenue Pulse Integration](#17-revenue-pulse-integration)
18. [Database Schema](#18-database-schema)
19. [Security & RLS](#19-security--rls)
20. [Pagination Strategy](#20-pagination-strategy)

---

## 1. Architecture Overview

### Layout

- **`PMSLayout`** (`src/components/layout/PMSLayout.tsx`) — Wraps all PMS pages with sidebar navigation (desktop) and bottom navigation (mobile).
- **`PMSSidebar`** — Left navigation with links to all 9 PMS sub-modules.
- **`PMSBrandProvider`** — Applies property-specific branding (logo, colors) to the PMS shell.
- **`HelpProvider` + `PMSHelpDrawer`** — Contextual help system with floating help button.

### Routing

| Route | Component | Description |
|---|---|---|
| `/pms` | `PMSDashboard` | Calendar + stats + booking management |
| `/pms/rooms` | `PMSRooms` | Physical room inventory |
| `/pms/room-types` | `PMSRoomTypes` | Room type CRUD with overview sync |
| `/pms/rate-plans` | `PMSRatePlans` | Rate plan management + room type linking |
| `/pms/guests` | `PMSGuests` | Guest CRM with booking history |
| `/pms/housekeeping` | `PMSHousekeeping` | 3-column board + maintenance dockets |
| `/pms/reports` | `PMSReports` | KPI dashboards + charts + CSV export |
| `/pms/branding` | `PMSBranding` | Logo, colors, business identity |
| `/pms/integrations` | `PMSIntegrations` | Website toolkit (widgets, API, embeds) |

### Property Context

All PMS pages use the `usePmsPropertyId()` hook which resolves the active property from:
1. `?property=` URL parameter (highest priority)
2. First available ROL property for Admins/Devs
3. Owner-linked properties via `property_owners` table or `owner_email` match

---

## 2. Property Resolution

**Hook**: `usePmsPropertyId` (`src/hooks/usePmsPropertyId.ts`)

**Resolution Order**:
1. URL query parameter `?property={uuid}`
2. For admin/dev roles: first ROL property from `properties` where `is_rol_property = true`
3. For owners: properties linked via `property_owners` junction table OR matching `owner_email`

**Multi-property Support**: Dashboard includes a property selector dropdown that persists selection to URL.

---

## 3. Dashboard & Calendar

**File**: `src/pages/pms/PMSDashboard.tsx` (~1790 lines)

### Features

- **Statistics Cards**: Today's arrivals, departures, in-house guests, occupancy rate, dirty rooms, maintenance alerts
- **Calendar Grid**: 30-day rolling window from current date
  - **Week View**: 7-day columns with room rows
  - **Month View**: 30-day columns with room rows
- **Booking Spans**: Interactive colored bars spanning check-in to check-out
  - Click to expand booking detail sheet
  - Color-coded by status (confirmed, checked_in, checked_out, cancelled)
- **Restrictions**: Stop Sell (red), Min Stay (blue), Max Stay (green), Lead Advance, Lead Post
  - Color-coded markers matching the administrative calendar
- **Booking Lifecycle Actions**:
  - Create new booking
  - Check-in (validates room readiness)
  - Check-out (triggers housekeeping)
  - Modify dates/rooms
  - Cancel with reason

### Data Sources

- `bookings` table filtered by property_id and date range (paginated via `useInfiniteQuery`, auto-fetches all pages)
- `rolos_rooms` for physical room grid
- `rolos_room_types` for type labels
- `rolos_restrictions` for stop-sell/min-stay markers

### Pagination

Bookings query uses `useInfiniteQuery` with `PAGE_SIZE=500` and `.range()` pagination. A `useEffect` auto-triggers `fetchNextPage` when `hasNextPage` is true, ensuring the calendar always has complete data even for high-volume properties.

---

## 4. Room Inventory

**File**: `src/pages/pms/PMSRooms.tsx`

### Features

- **Auto-sync from Property Overview**: On load, syncs room types from `hostfully_room_types` or `properties.amenities.room_types` (for ROL properties) into `rolos_room_types`, then auto-creates physical rooms in `rolos_rooms`
- **CRUD Operations**: Create, edit, delete physical rooms
- **Status Management**: Available, Occupied, Dirty, Maintenance, Out of Order
  - Status changeable via dropdown on each room card
- **Room Type Linking**: Each physical room linked to a `rolos_room_type`

### Status Colors

| Status | Color |
|---|---|
| available | Emerald |
| occupied | Blue |
| dirty | Amber |
| maintenance | Red |
| out_of_order | Destructive |

### Data Flow

```
Property Overview (amenities.room_types / hostfully_room_types)
  ↓ syncRoomTypesFromOverview()
rolos_room_types
  ↓ auto-create physical rooms
rolos_rooms (physical inventory)
```

---

## 5. Room Types

**File**: `src/pages/pms/PMSRoomTypes.tsx`

### Bidirectional Sync

Room types sync between Property Overview and PMS via database triggers:

- **Overview → PMS**: `sync_overview_to_rolos_room_types()` trigger on `hostfully_room_types`
- **PMS → Overview**: `sync_rolos_to_overview_room_types()` trigger on `rolos_room_types`

Both triggers use `app.syncing_room_types` session variable to prevent recursive loops.

### Fields

| Field | Type | Description |
|---|---|---|
| name | text | Room type name |
| description | text | Description |
| max_occupancy | integer | Maximum guests |
| default_rate | numeric | Default nightly rate |
| amenities | jsonb | Room amenities list |
| images | jsonb | Photo gallery |
| is_active | boolean | Active/inactive toggle |
| linked_overview_id | uuid | FK to hostfully_room_types |

---

## 6. Rate Plans & Pricing Engine

**File**: `src/pages/pms/PMSRatePlans.tsx`

### Pricing Models

| Model | Code | Description |
|---|---|---|
| Per Room | `per_room` | Flat rate per room per night |
| Per Person | `per_person` | Rate × number of guests |
| Per Room + Extras | `per_room_extra` | Base room rate + per-extra-guest surcharge |
| Tiered | `tiered` | Different rates per occupancy tier |

### Features

- Create/edit rate plans with name, code, description, pricing model, base rate, min stay
- Link rate plans to specific room types via `rolos_rate_plan_room_types` junction table
- Toggle active/inactive with visual distinction (inactive plans shown at 50% opacity with "Inactive" badge)
- Deposit requirement toggle with percentage

### Seasonal Rates

Table: `rolos_rate_seasons` with GiST-enforced overlap prevention
- Season name, date range, rate multiplier
- Day-of-week multipliers for dynamic pricing

### Auto-sync from Amenities

Rate plans auto-sync from `properties.amenities.room_types` for ROL properties, creating default plans linked to room types.

---

## 7. Guest CRM

**File**: `src/pages/pms/PMSGuests.tsx`

### Features

- **Guest Profiles**: Name, email, phone, nationality, preferences, notes, VIP flag
- **Booking History**: All bookings for each guest with status, dates, revenue
- **Search & Filter**: By name, email, phone (debounced 400ms)
- **Detail Sheet**: Side panel with full guest profile and booking timeline
- **Complaint Tracking**: Guest complaints linked to profiles with resolution status
- **Tags & Blacklisting**: Guest tagging and blacklist flag

### Data Source

Table: `rolos_guest_profiles` scoped to `property_id`

---

## 8. Housekeeping & Maintenance

**File**: `src/pages/pms/PMSHousekeeping.tsx`

### 3-Column Board

| Column | Content |
|---|---|
| **Dirty Rooms** | Rooms with `status = 'dirty'`, active cleaning tasks, maintenance dockets |
| **In Progress** | Rooms with active `rolos_housekeeping_tasks` in `in_progress` status |
| **Clean / Ready** | Rooms with `status = 'available'` |

### Fallback Mode

When no physical rooms exist in `rolos_rooms`, the board derives synthetic rooms from `rolos_room_types` (room_number = type name). An info banner is displayed: *"No physical rooms configured. Showing room types as fallback."*

### Cleaning Tasks

Table: `rolos_housekeeping_tasks`
- Task types: daily_clean, deep_clean, turnover, inspection
- Priority: low, normal, high, urgent
- Status: pending → in_progress → completed
- Assigned to staff member

### Maintenance Dockets

Table: `rolos_maintenance_requests`
- Issue types: plumbing, electrical, hvac, furniture, general
- Priority levels with color-coded badges
- Resolution workflow: open → in_progress → resolved
- Completion notes, estimated/actual cost tracking
- Room readiness confirmation before returning to service

### Quick Actions

- **Mark Clean**: For dirty rooms with no active task, one-click to set status to "available"
- **Report Issue**: Creates maintenance docket directly from room card
- **Complete Task**: Marks cleaning task as completed and triggers room status update

### Auto-refresh

Housekeeping board auto-refreshes every 30 seconds for real-time updates.

---

## 9. Property Reports

**File**: `src/pages/pms/PMSReports.tsx`

### KPIs

| Metric | Formula |
|---|---|
| Revenue | Sum of `total_price` for active bookings |
| Occupancy % | Booked nights / (rooms × days in period) |
| ADR | Revenue / active bookings |
| RevPAR | Revenue / available room-nights |
| Cancellation Rate | Cancelled bookings / total bookings |

### Date Filtering

Bookings are filtered by **`check_in_date`** (not `created_at`) to align with Revenue Pulse reporting and ensure revenue is attributed to the stay period.

### Period Options

- Last 7 Days, Last 30 Days, This Month, Last Month, This Year

### Charts

1. **Revenue & Bookings** — Bar + Line combo chart
2. **Occupancy Trend** — Area chart (0-100%)
3. **Average Daily Rate** — Line chart
4. **Channel Breakdown** — Horizontal bar chart by booking channel

### Export

CSV export with columns: Date, Bookings, Revenue, Occupancy %, ADR

### Aggregation

- Periods ≤45 days: Daily buckets
- Periods >45 days: Monthly buckets

### Pagination

Uses `useInfiniteQuery` with `PAGE_SIZE=500` and `.range()` pagination. All pages are aggregated into KPI calculations and chart data. A "Load more" button appears when additional pages are available.

---

## 10. Branding

**File**: `src/pages/pms/PMSBranding.tsx`

### Features

- Property logo upload (stored in Supabase Storage)
- Brand colors (primary, secondary, accent, font)
- Business identity: Name, address, VAT number
- VAT registration toggle with configurable rate
- Stationery: Email footer text, custom tagline, favicon
- Brand preview showing how branding appears on guest-facing documents

### Data Storage

- **Visual branding** (logo, colors): Stored on `properties` table for cross-system sync
- **Stationery config** (business name, VAT, tagline): Stored in `rolos_brand_config` table

---

## 11. Integrations

**File**: `src/pages/pms/PMSIntegrations.tsx`

### Integration Channels

| Channel | Description | Commission Type |
|---|---|---|
| Direct Link | URL to booking page | PMS |
| Widget | Embeddable booking widget | PMS |
| Booking Bar | Search bar for website headers | PMS |
| Full Embed | Full-page booking experience | PMS |
| WordPress Plugin | WP shortcode/plugin | PMS |
| API | RESTful booking API | PMS |

### Tracking

All bookings via integrations are tagged with:
- `integration_type`: widget, embed, api, wordpress, booking_bar, direct
- `source_url`: Referring page URL

This data feeds into the dual commission system for PMS rate attribution.

---

## 12. Edge Functions

### `roomsonline-pms-api`

Central PMS API edge function (~1800+ lines) handling 30+ action types:

**Booking Lifecycle:**
- `create_reservation` — Creates booking + inserts into `rolos_reservations` + `rolos_reservation_rooms` + status history + updates inventory calendar
- `modify_reservation` — Date/room/guest changes + updates `rolos_reservations` + status history + inventory recalculation
- `cancel_reservation` — Cancellation with reason + status history + inventory release
- `check_in` — Validates room readiness, updates booking status
- `check_out` — Updates booking, triggers housekeeping (sets rooms to dirty)

**Availability & Inventory:**
- `get_availability` — Room availability for date range
- `update_inventory` — Upsert rows in `rolos_inventory_calendar`
- `check_inventory` — Query available units for date range

**Guest CRM:**
- `get_guest_profiles` — Paginated guest search (limit/offset)
- `create_guest_profile` — New guest with property scoping

**Housekeeping & Folios:**
- `get_housekeeping_board` — Paginated housekeeping tasks
- `get_daily_metrics` — Paginated metrics retrieval

**Pagination Envelope:**
All list endpoints return `{ items: [...], total_count, has_more }` with `limit` (default 100, max 500) and `offset` parameters.

### `push-booking`

Booking ingestion from external PMS systems. **Now detects `is_rol_property`** and triggers `roomsonline-pms-api/create_reservation` for ROL properties, ensuring bookings flow into the operational reservation tables.

### `calculate-commission`

Dual-rate commission calculation:
- Resolves `commission_type` (listing vs pms) from `integration_type` and `booking_channel`
- Queries `property_commercial_terms` filtered by resolved type
- Falls back to defaults: 10% listing, 2% PMS
- Stores `commission_type` and `calculated_commission` on booking

### `revenue-pulse-api`

Admin revenue reporting:
- Splits ROL revenue into `listingRevenue` and `pmsRevenue` streams
- Aggregates by property, channel, and commission type
- Period filtering (30d, 90d, 1y, custom)

### `pms-night-audit`

Scheduled daily cron (02:00 SAST / 00:00 UTC). See [Night Audit](#15-night-audit).

### `sync-rolos-room-types`

Daily safety-net cron ensuring parity between `rolos_room_types` ↔ `hostfully_room_types` and auto-creating missing physical rooms in `rolos_rooms`.

### `cancel-booking`

Cancellation endpoint with `getClaims(token)` validation for secure token-based auth (verify_jwt = false).

---

## 13. Reservation Engine

### Overview

The reservation engine provides an operational layer on top of the `bookings` table, enabling status tracking, room assignment history, and audit trails for the full reservation lifecycle.

### Tables

| Table | Purpose |
|---|---|
| `rolos_reservations` | Operational reservation records linked to bookings |
| `rolos_reservation_rooms` | Per-reservation room assignments with rate tracking |
| `rolos_reservation_status_history` | Full audit trail of status transitions |

### Reservation Schema

```
rolos_reservations:
  id, property_id, booking_id (FK), status, check_in, check_out,
  guest_id (FK → rolos_guest_profiles), created_by,
  confirmation_number, total_amount, currency, special_requests,
  created_at, updated_at
```

### Status Flow

```
pending → confirmed → checked_in → checked_out
                   ↘ cancelled
                   ↘ no_show
```

Every status change is logged to `rolos_reservation_status_history` with the old/new status, changed_by user, reason, and timestamp.

### Room Assignments

```
rolos_reservation_rooms:
  reservation_id (FK), room_type_id (FK), room_id (FK, nullable),
  adults, children, teens, infants, rate_charged
```

### Integration with `push-booking`

When a booking is pushed for an `is_rol_property`, the system automatically creates the corresponding `rolos_reservations` entry, room assignments, and status history via the `roomsonline-pms-api/create_reservation` action.

---

## 14. Inventory Calendar

### Overview

Real-time inventory tracking per room type per date, enabling accurate availability queries and overbooking prevention.

### Table

```
rolos_inventory_calendar:
  property_id, room_type_id, date,
  total_units, booked_units, blocked_units,
  available_units (generated: total_units - booked_units - blocked_units),
  restrictions (JSONB),
  created_at, updated_at

UNIQUE INDEX: (property_id, room_type_id, date)
```

### Automatic Updates

- **Reservation creation**: Increments `booked_units` for each date in the stay
- **Reservation modification**: Recalculates units for old and new date ranges
- **Reservation cancellation**: Decrements `booked_units` to release inventory

### Available Units

`available_units` is a **generated column**: `total_units - booked_units - blocked_units`, always consistent without application logic.

---

## 15. Night Audit

### Overview

Automated daily process that closes the previous business day and prepares for the next.

### Schedule

Cron: `0 0 * * *` UTC (02:00 SAST) via `pms-night-audit` edge function.

### Tasks

1. **Roll Housekeeping**: Rooms with `status = 'occupied'` → create `dirty` housekeeping task for next day
2. **Finalize Occupancy**: Count checked-in reservations for the previous day
3. **Calculate Metrics**: Compute ADR, RevPAR, total revenue → upsert into `rolos_daily_metrics`
4. **Close Folios**: Folios with `checkout_date = yesterday` and `balance = 0` → set status to `closed`

### Metrics Calculation

```
ADR = Total Revenue / Occupied Rooms
RevPAR = Total Revenue / Total Available Rooms
Occupancy = Occupied Rooms / Total Available Rooms × 100
```

### Scope

Processes all properties where `is_rol_property = true`.

---

## 16. Commission System

### Dual Rate Architecture

Each property can have **two active commission rates**:

| Type | Description | Default | Applied When |
|---|---|---|---|
| **Listing** | Bookings via Sleep in Africa marketplace | 10% | `booking_channel` is marketplace/OTA |
| **PMS** | Bookings via ROL'OS integrations | 2-5% | `integration_type` is rolos/widget/api/embed |

### Rate Resolution Logic

```
IF integration_type IN (rolos, widget, embed, api, wordpress, booking_bar)
  → commission_type = 'pms'
ELSE IF booking_channel = 'direct' AND source has ROL'OS markers
  → commission_type = 'pms'
ELSE
  → commission_type = 'listing'
```

### Storage

- `property_commercial_terms`: Stores rates with `commission_type` column
  - Unique index: `(property_id, commission_type, effective_from)`
- `bookings`: Stores `commission_type` for audit trail

### Contract Integration

Contract templates support two dynamic variables:
- `{{listing_commission_percentage}}` — e.g., "ten percent (10%)"
- `{{pms_commission_percentage}}` — e.g., "two percent (2%)"
- `{{commission_percentage}}` — Backward compatible, resolves to listing rate

---

## 17. Revenue Pulse Integration

### Data Flow

```
Bookings (with commission_type) 
  → calculate-commission (edge function)
  → bookings.calculated_commission + bookings.commission_type
  → revenue-pulse-api (aggregation)
  → ROLRevenuePulse dashboard
```

### Revenue Split Display

The Revenue Pulse dashboard (`/pulse`) displays:
- **Total ROL Revenue**: Combined listing + PMS income
- **Listing Revenue**: Income from marketplace bookings
- **PMS Revenue**: Income from integration/direct bookings
- **Per-property breakdown** with commission type indicators

### Access Control

Revenue Pulse is restricted to `admin` and `dev` roles via `can_view_rol_pulse()` database function.

---

## 18. Database Schema

### Core PMS Tables

| Table | Purpose |
|---|---|
| `rolos_rooms` | Physical room inventory with status |
| `rolos_room_types` | Room type definitions with overview sync |
| `rolos_rate_plans` | Pricing plans with models |
| `rolos_rate_plan_room_types` | Rate plan ↔ room type junction |
| `rolos_rate_seasons` | Seasonal rate multipliers |
| `rolos_rate_prices` | Day-of-week rate pricing |
| `rolos_guest_profiles` | Guest CRM profiles |
| `rolos_guest_comments` | Guest comment threads |
| `rolos_housekeeping_tasks` | Cleaning task queue |
| `rolos_housekeeping_schedules` | Recurring cleaning schedules |
| `rolos_maintenance_requests` | Maintenance docket tracking |
| `rolos_folios` | Financial folio headers |
| `rolos_folio_transactions` | Individual folio line items |
| `rolos_restrictions` | Stop sell, min/max stay rules |
| `rolos_daily_metrics` | Auto-computed ADR, RevPAR, occupancy |
| `rolos_brand_config` | Property business stationery config |
| `rolos_booking_room_assignments` | Booking ↔ room assignment tracking |

### Reservation Engine Tables (v2.0)

| Table | Purpose |
|---|---|
| `rolos_reservations` | Operational reservation records with lifecycle status |
| `rolos_reservation_rooms` | Per-reservation room & rate assignments |
| `rolos_reservation_status_history` | Full status change audit trail |
| `rolos_inventory_calendar` | Per-date per-type inventory tracking with generated `available_units` |

### Supporting Tables

| Table | Purpose |
|---|---|
| `bookings` | Core booking records (shared across all PMS systems) |
| `property_commercial_terms` | Commission rates with `commission_type` |
| `hostfully_room_types` | Property Overview room types (sync source) |
| `properties` | Master property record with `is_rol_property` flag |
| `property_staff` | Staff members linked to properties |

### Performance Indexes

- `bookings(property_id, check_in_date)`
- `rolos_reservations(property_id, check_in)`
- `rolos_inventory_calendar(property_id, room_type_id, date)` (unique)

---

## 19. Security & RLS

### Row-Level Security

All `rolos_*` tables have RLS policies ensuring:
- **Owners**: Can only access data for their linked properties
- **Admins/Devs**: Full access across all properties
- **Guests**: No direct table access (all guest-facing via edge functions)

### Role Resolution

Uses `has_role(user_id, role)` security definer function to check roles without recursive RLS issues.

### Property Ownership Verification

Two functions validate property access:
- `is_property_owner(property_id, user_id)` — Checks `owner_email` match via profiles
- `is_linked_owner(property_id, user_id)` — Checks `property_owners` junction table

### Edge Function Authentication

- PMS API edge functions use `verify_jwt = false` with custom token validation via `getClaims(token)` for the signing-keys system
- `cancel-booking` and `modify-booking` use `getClaims(token)` for secure validation without JWT verification
- All destructive operations are logged to `audit_logs`

### Audit Trail

All changes to PMS tables are logged via the `log_audit_change()` trigger, capturing:
- User identity and role
- Before/after values
- Changed fields
- Immutable SHA-256 hash for tamper detection

---

## 20. Pagination Strategy

### Problem

Supabase has a default 1000-row limit per query. High-volume properties can exceed this for bookings, guest profiles, and metrics.

### Solution

All high-volume queries now use pagination:

| Component | Pattern | Page Size | Behavior |
|---|---|---|---|
| **PMSDashboard** (bookings) | `useInfiniteQuery` + auto-fetch | 500 | Auto-fetches all pages silently (calendar needs complete data) |
| **PMSReports** (bookings) | `useInfiniteQuery` + Load More | 500 | "Load more" button; KPIs aggregate across all fetched pages |
| **Edge Function APIs** | `limit`/`offset` params | 100 (default, max 500) | Returns `{ items, total_count, has_more }` envelope |

### Edge Function Pagination Envelope

```json
{
  "success": true,
  "data": {
    "reservations": [...],
    "total_count": 1247,
    "has_more": true
  }
}
```

Paginated endpoints: `get_reservations`, `get_guest_profiles`, `get_housekeeping_board`, `get_daily_metrics`.

---

## Appendix: Known Constraints

1. **Housekeeping fallback mode**: When no physical rooms exist in `rolos_rooms`, the board derives synthetic rooms from `rolos_room_types`. Dashboard dirty/maintenance indicators show 0 in this state.

2. **Room type sync is one-directional at page load**: While database triggers handle bidirectional sync, the PMSRooms page also runs a one-time sync on load to catch any gaps. A daily `sync-rolos-room-types` cron provides an additional safety net.

3. **Structural `as any` casts**: Some PMS pages retain `as any` casts for two reasons:
   - **Json columns**: Supabase types `amenities`, `complaints`, etc. as `Json | null` (generic). Casts to specific interfaces are structurally necessary.
   - **TS2589 deep instantiation**: Complex chained Supabase queries on tables with many columns can trigger TypeScript's recursion limit. Workaround: cast the query builder to `any`.

4. **Night audit timing**: Runs at 00:00 UTC (02:00 SAST). Properties in significantly different timezones may see metrics attributed to slightly offset dates.

5. **Inventory calendar backfill**: The `rolos_inventory_calendar` table must be initialized from existing room type counts. The `sync-rolos-room-types` cron handles initial population; manual corrections may be needed for historical data.
