# ROL'OS PMS Module — Technical Specification

> **Version**: 1.0  
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
13. [Commission System](#13-commission-system)
14. [Revenue Pulse Integration](#14-revenue-pulse-integration)
15. [Database Schema](#15-database-schema)
16. [Security & RLS](#16-security--rls)

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

**File**: `src/pages/pms/PMSDashboard.tsx` (~1627 lines)

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

- `bookings` table filtered by property_id and date range
- `rolos_rooms` for physical room grid
- `rolos_room_types` for type labels
- `rolos_restrictions` for stop-sell/min-stay markers

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
- **Search & Filter**: By name, email, phone
- **Detail Sheet**: Side panel with full guest profile and booking timeline
- **Complaint Tracking**: Guest complaints linked to profiles

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

---

## 10. Branding

**File**: `src/pages/pms/PMSBranding.tsx`

### Features

- Property logo upload (stored in Supabase Storage)
- Brand colors (primary, secondary, accent)
- Business identity: Legal name, trading name, registration number
- VAT number and tax settings
- Stationery: Invoice header, footer text
- Brand preview showing how branding appears on guest-facing documents

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

Central PMS API edge function handling:
- `check_in` — Validates room readiness, updates booking status
- `check_out` — Updates booking, triggers housekeeping (sets rooms to dirty)
- `create_booking` — Creates booking with room assignment
- `modify_booking` — Date/room/guest changes
- `cancel_booking` — Cancellation with reason tracking
- `get_availability` — Room availability for date range

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

---

## 13. Commission System

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

## 14. Revenue Pulse Integration

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

## 15. Database Schema

### Core PMS Tables

| Table | Purpose |
|---|---|
| `rolos_rooms` | Physical room inventory with status |
| `rolos_room_types` | Room type definitions with overview sync |
| `rolos_rate_plans` | Pricing plans with models |
| `rolos_rate_plan_room_types` | Rate plan ↔ room type junction |
| `rolos_rate_seasons` | Seasonal rate multipliers |
| `rolos_guest_profiles` | Guest CRM profiles |
| `rolos_housekeeping_tasks` | Cleaning task queue |
| `rolos_maintenance_requests` | Maintenance docket tracking |
| `rolos_folios` | Financial folio/transaction tracking |
| `rolos_restrictions` | Stop sell, min/max stay rules |
| `rolos_daily_metrics` | Auto-computed ADR, RevPAR, occupancy |

### Supporting Tables

| Table | Purpose |
|---|---|
| `bookings` | Core booking records (shared across all PMS systems) |
| `property_commercial_terms` | Commission rates with `commission_type` |
| `hostfully_room_types` | Property Overview room types (sync source) |
| `properties` | Master property record with `is_rol_property` flag |

---

## 16. Security & RLS

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

PMS API edge functions use `verify_jwt = false` with custom token validation via `getClaims(token)` for the signing-keys system (see memory: pms-adapter-interop-and-security).

### Audit Trail

All changes to PMS tables are logged via the `log_audit_change()` trigger, capturing:
- User identity and role
- Before/after values
- Changed fields
- Immutable SHA-256 hash for tamper detection

---

## Appendix: Known Constraints

1. **Housekeeping counts require physical rooms**: Dirty/maintenance indicators on the dashboard only function when physical rooms exist in `rolos_rooms`. Properties with only room types configured will show 0 for these metrics.

2. **Room type sync is one-directional at page load**: While database triggers handle bidirectional sync, the PMSRooms page also runs a one-time sync on load to catch any gaps.

3. **Supabase 1000-row limit**: Queries to `bookings` and other tables are subject to the default 1000-row limit. For properties with high booking volumes, pagination should be considered.

4. **`as any` type casts**: Several PMS pages use `as any` casts on Supabase table references (`rolos_rooms`, `rolos_housekeeping_tasks`, etc.) because the auto-generated types file may lag behind migrations. These are functional but suppress type checking.
