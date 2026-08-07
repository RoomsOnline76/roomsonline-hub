# ROL'OS PMS Module — Technical Specification

> **Version**: 4.0  
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
12. [Channel Manager](#12-channel-manager)
13. [Group Bookings](#13-group-bookings)
14. [Events & Function Spaces](#14-events--function-spaces)
15. [Financial Engine](#15-financial-engine)
16. [Staff Management](#16-staff-management)
17. [Messaging & Templates](#17-messaging--templates)
18. [Revenue Management](#18-revenue-management)
19. [Portfolio View](#19-portfolio-view)
20. [Edge Functions](#20-edge-functions)
21. [Reservation Engine](#21-reservation-engine)
22. [Inventory Calendar](#22-inventory-calendar)
23. [Night Audit](#23-night-audit)
24. [Commission System](#24-commission-system)
25. [Revenue Pulse Integration](#25-revenue-pulse-integration)
26. [Bidirectional Sync Architecture](#26-bidirectional-sync-architecture)
27. [TOBI AI Assistant](#27-tobi-ai-assistant)
28. [Database Schema](#28-database-schema)
29. [Security & RLS](#29-security--rls)
30. [Pagination Strategy](#30-pagination-strategy)
31. [Permission Matrix](#31-permission-matrix)

---

## 1. Architecture Overview

### Layout

- **`PMSLayout`** (`src/components/layout/PMSLayout.tsx`) — Wraps all PMS pages with sidebar navigation (desktop) and bottom navigation (mobile).
- **`PMSSidebar`** — Left navigation with 3 groups: Operations (4), Revenue (5), Management (7) = 16 total nav items.
- **`PMSBrandProvider`** — Applies property-specific branding (logo, colors) to the PMS shell via CSS variables.
- **`HelpProvider` + `PMSHelpDrawer`** — Contextual help system with floating help button and TOBI AI assistant.
- **`ForcePasswordChangeModal`** — Enforces first-login password change for staff members.

### Routing

| Route | Component | Description |
|---|---|---|
| `/pms` | `PMSDashboard` | Calendar + stats + booking management |
| `/pms/rooms` | `PMSRooms` | Physical room inventory |
| `/pms/room-types` | `PMSRoomTypes` | Room type CRUD with overview sync |
| `/pms/rate-plans` | `PMSRatePlans` | Rate plan management + room type linking |
| `/pms/guests` | `PMSGuests` | Guest CRM with booking history |
| `/pms/housekeeping` | `PMSHousekeeping` | 3-column board + maintenance dockets |
| `/pms/channels` | `PMSChannels` | OTA channel manager (connections, mappings, sync) |
| `/pms/groups` | `PMSGroups` | Group/block booking management |
| `/pms/events` | `PMSEvents` | Event & function space management |
| `/pms/revenue` | `PMSRevenue` | Revenue management with forecasting + performance history |
| `/pms/portfolio` | `PMSPortfolio` | Multi-property portfolio overview |
| `/pms/night-audit` | `PMSNightAudit` | Night audit controls and logs |
| `/pms/messaging` | `PMSMessaging` | Message templates, queue, and log |
| `/pms/reports` | `PMSReports` | KPI dashboards + charts + CSV export |
| `/pms/branding` | `PMSBranding` | Logo, colors, business identity |
| `/pms/integrations` | `PMSIntegrations` | Website toolkit (widgets, API, embeds) |
| `/pms/staff` | `PMSStaff` | Staff roster & shift management |

### Property Context

All PMS pages use the `usePmsPropertyId()` hook which resolves the active property from:
1. `?property=` URL parameter (highest priority)
2. First available ROL property for Admins/Devs
3. Owner-linked properties via `property_owners` table or `owner_email` match

### Staff Login

Properties have a dedicated staff login URL: `/{domain}/staff-login?property={slug}`. This renders a branded login page using the property's logo and colors from the `properties` table.

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

**File**: `src/pages/pms/PMSDashboard.tsx`

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

**File**: `src/pages/pms/PMSRatePlans.tsx` (surface: `src/components/pms/rateplans/RatePlansSurface.tsx`)

**The rule:** Calendar = seasons only (when). Rate Plans = commercial rates and unit links
(what it costs).

Rate Plans is the single configurator for a ROL'OS property's rates. Season **dates** are
painted only in the Calendar and appear here read-only; season **pricing** is authored only
here.

### Pricing Models

| Model | Code | Description |
|---|---|---|
| Per Room | `per_room` | Flat rate per room per night |
| Per Person | `per_person` | Rate × number of guests |
| Per Person Sharing | `per_person_sharing` | Base for 2 guests, extra per additional |
| Per Unit | `per_unit` | Rate × units × nights |

### Editor sections

1. **Basics** — name, code, description, pricing model, base rate, deposit, active toggle.
2. **Pricing by Season** — one row per Calendar season; absolute nightly rate or a
   differential (`+amount` / `+percent`) off the base. Dates are not editable here.
3. **Restrictions** — min/max stay, advance-booking minimum and maximum.
4. **Linked Units** — room types linked to the plan, each with an optional differential.
5. **Live Preview** — nightly rates per linked unit and the tier that produced each one,
   computed by the same pure engine the booking path uses.

### Calculation

`supabase/functions/_shared/ratePricing.ts` is the pure effective-rate engine; every
consumer reaches it through the resolver adapter. See
`docs/architecture/rate-plans-adapter-note.md` for the tier precedence and the
`properties.rate_resolution_mode` kill switch.

### Admin surface

- **ROL'OS properties** — Admin → Edit Property → Rates & Pricing shows a read-only Rate
  Plans summary plus a "Manage Rate Plans in ROL'OS" deep link. The legacy Rate Types,
  Seasons and Rate Breakdown sub-tabs are hidden and Admin issues no rate writes.
- **Non-ROL'OS properties** — the same Rate Plans configurator is shown fully editable,
  and the legacy sub-tabs remain available.

### Backward compatibility

Saves also write the legacy relational rows and `properties.amenities.pms_rate_types`
buckets that existing readers query, via the trigger pair
`sync_rolos_rates_to_overview()` / `sync_overview_rates_to_rolos()` (both guarded by the
`app.syncing_rate_plans` session variable to prevent recursion). All properties currently
resolve rates through the legacy tiers, so these mirrors are live — see
`docs/rates-shim-inventory.md` before removing any of them.


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

- **Visual branding** (logo, colors): Stored on `properties` table for cross-system sync — shared with Admin Property Edit
- **Stationery config** (business name, VAT, tagline): Stored in `rolos_brand_config` table

### Bidirectional Sync

Both Admin Property Edit "Branding" tab and PMS Branding page read/write the same `properties.brand_*` columns. Changes in either are immediately reflected in the other.

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

## 12. Channel Manager

**File**: `src/pages/pms/PMSChannels.tsx`  
**Hook**: `src/hooks/useChannelManager.ts`  
**Components**: `src/components/pms/channels/`

### Overview

OTA channel management system for connecting to distribution channels, mapping internal room types and rate plans to external OTA identifiers, and monitoring synchronisation.

### Supported Channels

| Channel | Key | Description |
|---|---|---|
| Booking.com | `booking_com` | World's largest OTA — sync availability, rates & reservations |
| Airbnb | `airbnb` | Vacation rental marketplace — manage listings & guest comms |
| Expedia | `expedia` | Global travel platform — distribute inventory across Expedia Group brands |
| Agoda | `agoda` | Asia-focused OTA — reach travellers across APAC markets |
| Google Hotels | `google_hotels` | Surface rates on Google Search & Maps via Hotel Ads |

### Tab 1: Connections

- Grid of channel cards showing: branded logo, channel name, description, status badge (active/paused/error/disconnected), last sync time, room/rate mapping counts
- **Connect**: Opens credential dialog for API key entry + settings configuration
- **Actions** (dropdown): Sync Now, Pause, Resume, Disconnect
- Status updates via `useUpdateConnectionStatus` mutation

### Tab 2: Mappings

- **Room Mappings**: Table linking internal `rolos_room_types` to external OTA room IDs
- **Rate Mappings**: Table linking internal `rolos_rate_plans` to external OTA rate IDs
- Inline edit for external IDs and names
- Filtered by active connections

### Tab 3: Sync Log

- Table of recent sync operations: channel, type, status, records processed, duration, errors
- Auto-refresh every 30 seconds via `refetchInterval`
- "Sync Now" triggers `pms-channel-sync` edge function

### Data Model

| Table | Purpose |
|---|---|
| `rolos_channel_connections` | OTA connection config per property (credentials, settings, status) |
| `rolos_channel_room_mapping` | Internal room type ↔ external OTA room ID |
| `rolos_channel_rate_mapping` | Internal rate plan ↔ external OTA rate ID |
| `rolos_channel_sync_log` | Audit trail for every sync operation (type, status, duration, errors) |
| `rolos_channel_reservations` | Inbound OTA reservations staging (dedup via unique connection+external_id) |

### Edge Function: `pms-channel-sync`

Actions: `push_inventory`, `pull_reservations`, `manual_sync`  
Currently stubbed — logs payloads for framework validation. Actual OTA API integration requires per-channel API credentials.

---

## 13. Group Bookings

**File**: `src/pages/pms/PMSGroups.tsx`

### Overview

Manage group/block bookings for tour operators, corporate events, and large parties. Groups aggregate multiple rooms under a single master booking with shared billing.

### Features

- **Group List**: Filterable table of all group bookings with status, dates, room count, total revenue
- **Status Badges**: confirmed (default), tentative (secondary), cancelled (destructive), checked_in (default), checked_out (outline)
- **Group Detail Sheet**: Side panel with full group info, room allocation breakdown, contact details, notes
- **Create/Edit Dialog**: Group name, contact info, date range, room count, total amount, status, notes
- **Actions**: Create new group, edit existing, view details

### Data Model

| Table | Purpose |
|---|---|
| `rolos_groups` | Master group record (name, contact, dates, rooms, amount, status, notes) |
| `rolos_group_room_blocks` | Room block allocations within a group |
| `rolos_group_reservations` | Individual reservations linked to a group |

---

## 14. Events & Function Spaces

**File**: `src/pages/pms/PMSEvents.tsx`

### Overview

Manage event spaces, function rooms, and event bookings. Supports weddings, conferences, banquets, and other property events.

### Features

- **Two Tabs**: Spaces (venue inventory) and Bookings (event reservations)
- **Event Spaces**: Cards showing space name, type, capacity, hourly rate, status, amenities
  - Create/edit with name, type (ballroom, conference_room, garden, restaurant, rooftop, other), capacity, hourly rate, amenities list
- **Event Bookings**: Table of all event reservations with status, space, dates, attendees, revenue
  - Create/edit with event name, space selection, date/time, attendees, total amount, contact info, status, notes
- **Status Badges**: confirmed (default), tentative (secondary), cancelled (destructive), completed (outline)

### Data Model

| Table | Purpose |
|---|---|
| `rolos_event_spaces` | Function space inventory (name, type, capacity, rate, amenities, status) |
| `rolos_events` | Event booking records (name, space, dates, attendees, amount, contact, status) |
| `rolos_event_reservations` | Per-event room reservations |

---

## 15. Financial Engine

### Overview

Comprehensive payment, invoicing, and tax management system. Supports multiple payment methods, refund workflows, and configurable tax rules.

### Data Model

| Table | Purpose |
|---|---|
| `rolos_payments` | Payment records (booking, amount, method, status, reference, gateway response) |
| `rolos_payment_allocations` | Allocations of payments to specific folios/invoices |
| `rolos_invoices` | Invoice records (booking, guest, line items, tax, total, status, due date) |
| `rolos_refunds` | Refund records linked to original payments |
| `rolos_tax_rules` | Property-scoped tax configurations (name, rate, type, applicability) |
| `rolos_deposit_schedules` | Deposit payment schedules and due dates |
| `rolos_pricing_rules` | Dynamic pricing rules and overrides |

### Edge Function: `pms-financial`

Actions:
- `record_payment` — Creates payment record, updates booking payment status
- `process_refund` — Creates refund record linked to original payment
- `generate_invoice` — Generates invoice with line items and tax calculation

---

## 16. Staff Management

**File**: `src/pages/pms/PMSStaff.tsx`

### Overview

Staff roster management with role assignment, linked to property-level access control.

### Features

- Staff member CRUD with name, email, role, department
- Role assignment from PMS permission matrix roles
- Shift scheduling via `rolos_staff_shifts`
- Activity logging via `rolos_staff_activity_log`
- Integration with `property_staff` table for RLS-based access
- Force password change on first login

---

## 17. Messaging & Templates

**File**: `src/pages/pms/PMSMessaging.tsx`  
**Hook**: `src/hooks/usePmsMessaging.ts`  
**Edge Function**: `pms-message-dispatcher`

### Overview

Automated guest messaging system with template management, queue processing, and delivery tracking via Resend.

### Features

- **Template Management**: Create, edit, delete message templates per property
- **Trigger Events**: booking_confirmed, pre_arrival, check_in, check_out, payment_request, cancellation, manual
- **Placeholder System**: `{{guest_name}}`, `{{guest_first_name}}`, `{{guest_email}}`, `{{property_name}}`, `{{check_in}}`, `{{check_out}}`, `{{confirmation_number}}`, `{{total_amount}}`, `{{nights}}`
- **Message Queue**: Schedule messages for future delivery with status tracking (pending → processing → sent/failed)
- **Message Log**: Full audit trail of all sent messages with status and error tracking
- **Manual Send**: Send immediate messages to specific recipients
- **Queue Processing**: Manual trigger or scheduled cron to process pending messages

### Auto-seeding

When a property is set as `is_rol_property = true`, the database trigger `seed_default_message_templates()` automatically creates 7 default templates:
1. Booking Confirmation
2. Pre-Arrival (24h before check-in)
3. Check-In Welcome
4. Check-Out Thank You
5. Payment Request
6. Cancellation Confirmation
7. Manual / Custom Message

### Bidirectional Sync with Admin

Message templates sync with `properties.amenities.templates` JSONB via database triggers:

- **PMS → Overview**: `sync_rolos_templates_to_overview()` — Maps booking_confirmed body → template_content, pre_arrival offset → pre_mailer timing, check_out offset → post_mailer timing
- **Overview → PMS**: `sync_overview_templates_to_rolos()` — Reverse mapping on amenities.templates change

### Data Model

| Table | Purpose |
|---|---|
| `rolos_message_templates` | Template definitions (name, trigger, subject, body, channel, offset) |
| `rolos_message_queue` | Queued messages awaiting delivery |
| `rolos_message_log` | Delivery audit trail (status, errors, timestamps) |

### Edge Function: `pms-message-dispatcher`

Actions: `list_templates`, `upsert_template`, `delete_template`, `queue_message`, `send_message`, `process_queue`, `get_message_log`, `get_queue`

Email delivery via Resend using `noreply@notify.roomsonline.co.za` with property name as sender.

---

## 18. Revenue Management

**File**: `src/pages/pms/PMSRevenue.tsx`

### Overview

Property-level revenue management with demand forecasting, performance analytics, and historical trend analysis.

### Tabs

| Tab | Content |
|---|---|
| **Forecast** | 14-day occupancy forecast, demand signals, revenue projections |
| **Performance** | Historical GBV, ADR, booking counts for 30/60/90 day periods |

### Performance Tab

- **KPI Cards**: Historical GBV, Total Bookings, ADR, Average Nights
- **Revenue Timeline**: Monthly bar chart of GBV over the selected period
- **Channel Mix**: Donut chart showing booking distribution by channel
- **Data Source**: `bookings` table filtered to exclude cancelled/failed, scoped by property and date range

### Forecast Tab

- Demand forecasting based on current bookings and inventory
- Daily occupancy projections with revenue estimates

---

## 19. Portfolio View

**File**: `src/pages/pms/PMSPortfolio.tsx`

### Overview

Multi-property dashboard for owners and managers with properties across the ROL'OS portfolio. Provides aggregated KPIs and per-property drill-down.

---

## 20. Edge Functions

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

### `pms-message-dispatcher`

Guest messaging system (see [Section 17](#17-messaging--templates)).

### `pms-channel-sync`

OTA channel synchronisation orchestrator (see [Section 12](#12-channel-manager)).

### `pms-financial`

Financial transaction processing (see [Section 15](#15-financial-engine)).

### `pms-night-audit`

Scheduled daily cron. See [Night Audit](#23-night-audit).

### `push-booking`

Booking ingestion from external PMS systems. Detects `is_rol_property` and triggers `roomsonline-pms-api/create_reservation` for ROL properties.

### `calculate-commission`

Dual-rate commission calculation (see [Section 24](#24-commission-system)).

### `revenue-pulse-api`

Admin revenue reporting with listing/PMS revenue split.

### `sync-rolos-room-types`

Daily safety-net cron ensuring parity between `rolos_room_types` ↔ `hostfully_room_types`.

### `cancel-booking`

Cancellation endpoint with `getClaims(token)` validation.

### `help-assistant`

TOBI AI assistant (see [Section 27](#27-tobi-ai-assistant)).

---

## 21. Reservation Engine

### Overview

The reservation engine provides an operational layer on top of the `bookings` table, enabling status tracking, room assignment history, and audit trails for the full reservation lifecycle.

### Tables

| Table | Purpose |
|---|---|
| `rolos_reservations` | Operational reservation records linked to bookings |
| `rolos_reservation_rooms` | Per-reservation room assignments with rate tracking |
| `rolos_reservation_status_history` | Full audit trail of status transitions |

### Status Flow

```
pending → confirmed → checked_in → checked_out
                   ↘ cancelled
                   ↘ no_show
```

Every status change is logged to `rolos_reservation_status_history` with the old/new status, changed_by user, reason, and timestamp.

---

## 22. Inventory Calendar

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

## 23. Night Audit

### Schedule

Cron: `0 0 * * *` UTC (02:00 SAST) via `pms-night-audit` edge function.

### Tasks

1. **Roll Housekeeping**: Rooms with `status = 'occupied'` → create `dirty` housekeeping task for next day
2. **Finalize Occupancy**: Count checked-in reservations for the previous day
3. **Calculate Metrics**: Compute ADR, RevPAR, total revenue → upsert into `rolos_daily_metrics`
4. **Close Folios**: Folios with `checkout_date = yesterday` and `balance = 0` → set status to `closed`

### Audit Log

Table: `rolos_night_audit_log` — Records each audit run with status, metrics computed, and errors.

### Metrics Calculation

```
ADR = Total Revenue / Occupied Rooms
RevPAR = Total Revenue / Total Available Rooms
Occupancy = Occupied Rooms / Total Available Rooms × 100
```

### Scope

Processes all properties where `is_rol_property = true`.

---

## 24. Commission System

### Dual Rate Architecture

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
- `bookings`: Stores `commission_type` for audit trail

---

## 25. Revenue Pulse Integration

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
- **Portfolio Demand Forecast**: Aggregated 14-day occupancy and revenue forecast across all PMS-managed properties

### Access Control

Revenue Pulse is restricted to `admin` and `dev` roles via `can_view_rol_pulse()` database function.

---

## 26. Bidirectional Sync Architecture

### Overview

For ROL'OS properties (`is_rol_property = true`), data surfaces that overlap between Admin Property Edit (`/admin/property/{id}`) and PMS pages (`/pms/*`) are kept in bidirectional sync via database triggers. Last write wins.

### Sync Map

| Data Surface | Admin Location | PMS Location | Sync Mechanism |
|---|---|---|---|
| **Room Types** | Rooms tab (amenities.room_types) | /pms/rooms, /pms/room-types | `sync_overview_to_rolos_room_types` ↔ `sync_rolos_to_overview_room_types` triggers on `hostfully_room_types` / `rolos_room_types` |
| **Rate Plans** | Rates tab — read-only summary + deep link for ROL'OS properties; full editable mirror for non-ROL'OS | /pms/rate-plans (single configurator, source of truth) | `sync_overview_rates_to_rolos` ↔ `sync_rolos_rates_to_overview` triggers on `properties` / `rolos_rate_plans` (backward-compatible mirror only) |
| **Seasons** | Calendar (season painting — dates only) | Priced in /pms/rate-plans | Calendar remains the only season configurator; Rate Plans reads seasons read-only |

| **Branding** | Branding tab (properties.brand_*) | /pms/branding | Shared DB columns — no trigger needed |
| **Message Templates** | Templates tab (amenities.templates) | /pms/messaging | `sync_overview_templates_to_rolos` ↔ `sync_rolos_templates_to_overview` triggers on `properties` / `rolos_message_templates` |

### Template Mapping

| Admin Templates Tab | PMS Messaging trigger_event |
|---|---|
| confirmation-mailer (body) | `booking_confirmed` (body) |
| pre-mailer (timing) | `pre_arrival` (send_offset_hours) |
| post-mailer (timing) | `check_out` (send_offset_hours) |

### Recursion Prevention

All sync triggers use transaction-scoped session variables (`set_config('app.syncing_*', 'true', true)`) to prevent infinite loops when both sides fire triggers.

### Auto-seeding on Property Activation

When `is_rol_property` is set to `true`, the `seed_default_message_templates()` trigger auto-creates 7 default templates if none exist.

---

## 27. TOBI AI Assistant

### Overview

TOBI is the property-specific AI assistant embedded in the ROL'OS PMS via the `PMSHelpDrawer`. It provides context-aware operational guidance using real-time property data.

### Architecture

- **Frontend**: `PMSTobiAssistant` component with streaming chat UI
- **Backend**: `help-assistant` edge function using Lovable AI gateway (model: `google/gemini-3-flash-preview`)
- **Data Fetching**: 13 parallel queries fetch property context (rooms, rates, bookings, arrivals, departures, channels, groups, events, staff, housekeeping, guests)

### Modes

| Mode | Trigger | System Prompt | Data Context |
|---|---|---|---|
| **Generic** | No propertyId | GENERIC_SYSTEM_PROMPT | Help articles from `help_articles` table |
| **PMS** | propertyId provided | PMS_SYSTEM_PROMPT | Full property operational data |

### PMS Context Data

- Property info (name, location, type)
- Room types with rates and occupancy
- Physical rooms with status counts
- Rate plans with min stay and active status
- Today's arrivals and departures (with guest names)
- Housekeeping task summary
- Guest database count
- Channel connections with sync status
- Upcoming groups and events
- Active staff roster
- Recent bookings (last 10)

### Quick Navigation

7 shortcut buttons: Dashboard, Rooms, Guests, Rates, Channels, Reports, Staff — all append `?property={id}` to preserve context.

### Suggested Prompts

- "What's happening today?"
- "Show occupancy & revenue"
- "How do I connect an OTA?"
- "Walk me through group bookings"
- "What can my front desk staff see?"
- "Navigate to housekeeping"

---

## 28. Database Schema

### Core PMS Tables (45 total)

| Table | Purpose |
|---|---|
| `rolos_rooms` | Physical room inventory with status |
| `rolos_room_types` | Room type definitions with overview sync |
| `rolos_rate_plans` | Pricing plans with models |
| `rolos_rate_plan_room_types` | Rate plan ↔ room type junction |
| `rolos_rate_seasons` | Seasonal rate multipliers |
| `rolos_rate_prices` | Day-of-week rate pricing |
| `rolos_pricing_rules` | Dynamic pricing rules and overrides |
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
| `rolos_booking_rooms` | Booking ↔ room assignment tracking |

### Reservation Engine Tables

| Table | Purpose |
|---|---|
| `rolos_reservations` | Operational reservation records with lifecycle status |
| `rolos_reservation_rooms` | Per-reservation room & rate assignments |
| `rolos_reservation_status_history` | Full status change audit trail |
| `rolos_inventory_calendar` | Per-date per-type inventory tracking with generated `available_units` |

### Channel Manager Tables

| Table | Purpose |
|---|---|
| `rolos_channel_connections` | OTA connection configs (credentials, settings, status) |
| `rolos_channel_room_mapping` | Internal room type ↔ external OTA room ID |
| `rolos_channel_rate_mapping` | Internal rate plan ↔ external OTA rate ID |
| `rolos_channel_sync_log` | Sync operation audit trail |
| `rolos_channel_reservations` | Inbound OTA reservation staging with dedup |

### Messaging Tables

| Table | Purpose |
|---|---|
| `rolos_message_templates` | Email template definitions (trigger, subject, body, timing) |
| `rolos_message_queue` | Queued messages awaiting delivery |
| `rolos_message_log` | Delivery audit trail (status, errors) |

### Financial & Operations Tables

| Table | Purpose |
|---|---|
| `rolos_payments` | Payment records (amount, method, status, gateway response) |
| `rolos_payment_allocations` | Payment-to-folio/invoice allocations |
| `rolos_refunds` | Refund records linked to original payments |
| `rolos_invoices` | Invoice records (line items, tax, totals, status) |
| `rolos_tax_rules` | Property-scoped tax configurations |
| `rolos_deposit_schedules` | Deposit payment schedules |
| `rolos_staff_shifts` | Staff shift scheduling records |
| `rolos_staff_activity_log` | Staff activity audit trail |
| `rolos_waitlist` | Booking waitlist for sold-out dates |
| `rolos_night_audit_log` | Night audit run records |

### Group & Event Tables

| Table | Purpose |
|---|---|
| `rolos_groups` | Master group booking records |
| `rolos_group_room_blocks` | Room block allocations within groups |
| `rolos_group_reservations` | Individual reservations linked to groups |
| `rolos_event_spaces` | Function space inventory |
| `rolos_events` | Event booking records |
| `rolos_event_reservations` | Per-event room reservations |

### Supporting Tables

| Table | Purpose |
|---|---|
| `bookings` | Core booking records (shared across all PMS systems) |
| `property_commercial_terms` | Commission rates with `commission_type` |
| `hostfully_room_types` | Property Overview room types (sync source) |
| `properties` | Master property record with `is_rol_property` flag |
| `property_staff` | Staff members linked to properties |

---

## 29. Security & RLS

### Row-Level Security

All `rolos_*` tables have RLS policies ensuring:
- **Owners**: Can only access data for their linked properties
- **Staff**: Access scoped by role and property via `property_staff`
- **Admins/Devs**: Full access across all properties
- **Guests**: No direct table access (all guest-facing via edge functions)

### Helper Functions

| Function | Purpose |
|---|---|
| `has_role(user_id, role)` | Security definer role check without recursive RLS |
| `is_property_owner(property_id, user_id)` | Checks `owner_email` match via profiles |
| `is_linked_owner(property_id, user_id)` | Checks `property_owners` junction table |
| `can_access_channel_property(property_id)` | Channel manager access via admin/dev/owner/staff role |
| `can_access_property(property_id)` | General property access check including staff roles |

### Edge Function Authentication

- PMS API edge functions use `verify_jwt = false` with custom token validation via `getClaims(token)`
- All destructive operations are logged to `audit_logs`

### Audit Trail

All changes to PMS tables are logged via the `log_audit_change()` trigger, capturing:
- User identity and role
- Before/after values
- Changed fields
- Immutable SHA-256 hash for tamper detection

---

## 30. Pagination Strategy

### Problem

Supabase has a default 1000-row limit per query. High-volume properties can exceed this for bookings, guest profiles, and metrics.

### Solution

| Component | Pattern | Page Size | Behavior |
|---|---|---|---|
| **PMSDashboard** (bookings) | `useInfiniteQuery` + auto-fetch | 500 | Auto-fetches all pages silently |
| **PMSReports** (bookings) | `useInfiniteQuery` + Load More | 500 | "Load more" button; KPIs aggregate across pages |
| **PMSChannels** (sync logs) | `useQuery` + limit | 100 | Latest 100 logs with 30s auto-refresh |
| **Edge Function APIs** | `limit`/`offset` params | 100 (max 500) | Returns `{ items, total_count, has_more }` envelope |

---

## 31. Permission Matrix

### Modules (17)

`dashboard`, `rooms`, `room-types`, `rate-plans`, `guests`, `housekeeping`, `channels`, `groups`, `events`, `revenue`, `portfolio`, `night-audit`, `messaging`, `reports`, `branding`, `integrations`, `staff`

### Role Access

| Role | Full Access | Read-Only | No Access |
|---|---|---|---|
| **Property Owner** | All 17 modules | — | — |
| **General Manager** | All 17 modules | — | — |
| **Front Desk** | dashboard, guests, messaging, calendar | rooms, housekeeping, channels, groups, events | rate-plans, revenue, reports, branding, integrations, staff, portfolio, night-audit |
| **Housekeeping** | housekeeping | rooms | All others |
| **Maintenance** | — | housekeeping | All others |
| **Accountant** | reports, revenue | guests, groups | All others |
| **Auditor** | — | All except integrations, staff | integrations, staff |

Platform admins/devs bypass the permission matrix entirely (full access to all modules).

---

## Appendix: Known Constraints

1. **Housekeeping fallback mode**: When no physical rooms exist in `rolos_rooms`, the board derives synthetic rooms from `rolos_room_types`. Dashboard dirty/maintenance indicators show 0 in this state.

2. **Room type sync is one-directional at page load**: While database triggers handle bidirectional sync, the PMSRooms page also runs a one-time sync on load to catch any gaps. A daily `sync-rolos-room-types` cron provides an additional safety net.

3. **Structural `as any` casts**: Some PMS pages retain `as any` casts for two reasons:
   - **Json columns**: Supabase types `amenities`, `complaints`, etc. as `Json | null` (generic). Casts to specific interfaces are structurally necessary.
   - **TS2589 deep instantiation**: Complex chained Supabase queries on tables with many columns can trigger TypeScript's recursion limit. Workaround: cast the query builder to `any`.

4. **Night audit timing**: Runs at 00:00 UTC (02:00 SAST). Properties in significantly different timezones may see metrics attributed to slightly offset dates.

5. **Inventory calendar backfill**: The `rolos_inventory_calendar` table must be initialized from existing room type counts. The `sync-rolos-room-types` cron handles initial population; manual corrections may be needed for historical data.

6. **Channel Manager stubs**: OTA API integrations (`push_inventory`, `pull_reservations`) are currently stubbed — the framework is in place but actual API calls require per-channel credentials and endpoint implementations.

7. **Financial edge function**: Payment gateway integrations (Stripe, PayGate, etc.) are not yet wired — `pms-financial` handles internal record-keeping and status management.

8. **Message delivery**: Email delivery via Resend requires `RESEND_API_KEY` secret to be configured. Queue processing can be triggered manually or via scheduled cron.
