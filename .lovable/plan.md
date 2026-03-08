
# Phase 1 — Channel Manager Foundation

## Scope

Build the OTA channel management system: database tables, edge function for sync orchestration, and a full UI dashboard at `/pms/channels`.

## Database Migration

**5 new tables:**

1. **`rolos_channel_connections`** — Stores OTA connection configs per property
   - `id`, `property_id` (FK properties), `channel_name` (enum: booking_com, airbnb, expedia, agoda, google_hotels, manual), `status` (enum: active, paused, error, disconnected), `credentials` (JSONB, encrypted at app level), `settings` (JSONB — sync interval, auto-confirm, etc.), `last_sync_at`, `last_error`, `created_at`, `updated_at`

2. **`rolos_channel_room_mapping`** — Maps internal room types to OTA room IDs
   - `id`, `connection_id` (FK channel_connections), `room_type_id` (FK rolos_room_types), `external_room_id` (text), `external_room_name` (text), `is_active`, `created_at`

3. **`rolos_channel_rate_mapping`** — Maps internal rate plans to OTA rate IDs
   - `id`, `connection_id` (FK channel_connections), `rate_plan_id` (FK rolos_rate_plans), `external_rate_id` (text), `external_rate_name` (text), `is_active`, `created_at`

4. **`rolos_channel_sync_log`** — Audit trail for every sync operation
   - `id`, `connection_id` (FK), `sync_type` (enum: push_inventory, pull_reservations, push_rates, full_sync), `status` (enum: success, partial, failed), `records_processed` (int), `errors` (JSONB), `started_at`, `completed_at`, `duration_ms` (int)

5. **`rolos_channel_reservations`** — Inbound OTA reservations before processing
   - `id`, `connection_id` (FK), `external_reservation_id` (text, unique per connection), `channel_name`, `raw_data` (JSONB), `processing_status` (enum: pending, processed, failed, duplicate), `booking_id` (FK bookings, nullable — linked after processing), `error_message`, `received_at`, `processed_at`

**RLS:** Admin/dev full access; property owners via `is_property_owner` or `is_linked_owner` on the connection's `property_id`. Staff with `general_manager` role get read access.

**Indexes:** Unique on `(connection_id, external_reservation_id)` for dedup; index on `property_id, channel_name` for connection lookups.

**Audit triggers:** All 5 tables get `log_audit_change()`.

## Permission Matrix Update

**File:** `src/lib/pmsPermissions.ts`
- Add `"channels"` to `PmsModule` type
- `property_owner` / `general_manager`: FULL access
- `front_desk`: RO (can see channel status, not edit)
- All others: NONE

## Sidebar + Routing

**File:** `src/components/layout/PMSSidebar.tsx`
- Add nav item: `{ title: "Channels", icon: Radio, href: "/pms/channels", module: "channels" }`

**File:** `src/App.tsx`
- Add route: `/pms/channels` → `PMSChannels` wrapped in `ProtectedRoute` + `PMSBrandProvider`

## UI Page: `src/pages/pms/PMSChannels.tsx`

Dashboard with 3 tabs:

### Tab 1: Connections
- Grid of channel cards (Booking.com, Airbnb, Expedia, Agoda, Google Hotels)
- Each shows: logo, status badge (active/paused/error/disconnected), last sync time, room/rate mapping count
- "Connect" button opens a dialog to enter credentials and configure settings
- "Pause" / "Resume" / "Disconnect" actions via dropdown

### Tab 2: Mappings
- Two sub-sections: Room Mappings and Rate Mappings
- Table showing internal name ↔ external ID for each active connection
- Inline edit for external IDs
- Bulk mapping assistant (auto-suggest based on name similarity)

### Tab 3: Sync Log
- Table of recent sync operations with status, duration, records processed, errors
- Filter by connection, sync type, status
- "Sync Now" button triggers manual sync for selected connection
- Auto-refresh every 30s via TanStack Query `refetchInterval`

## Edge Function: `supabase/functions/pms-channel-sync/index.ts`

Actions:
- `push_inventory` — Reads `rolos_inventory_calendar` for a property+connection, formats for the target OTA API, logs result to sync_log. Initially a **stub** that logs the payload (actual OTA API integration requires per-channel API keys — this builds the framework).
- `pull_reservations` — Fetches from OTA API (stub), deduplicates against `rolos_channel_reservations`, creates `bookings` + `rolos_reservations` for new ones.
- `get_sync_status` — Returns recent sync logs for a connection.
- `manual_sync` — Triggers push_inventory + pull_reservations for a connection.

Uses `verify_jwt = false` with `getClaims()` validation (matching existing adapter pattern).

## Components

- `src/components/pms/channels/ChannelCard.tsx` — Connection card with status, actions
- `src/components/pms/channels/ConnectChannelDialog.tsx` — Form for credentials + settings
- `src/components/pms/channels/MappingTable.tsx` — Room/rate mapping editor
- `src/components/pms/channels/SyncLogTable.tsx` — Paginated sync history
- `src/components/pms/channels/ChannelLogo.tsx` — OTA brand logos

## Implementation Order

1. Database migration (5 tables + RLS + indexes + triggers)
2. Permission matrix update + sidebar + route
3. Edge function stub
4. UI page with all 3 tabs
5. Update `docs/rolos-pms-module-spec.md` with Channel Manager section
