## What I verified first

- Database: every booking row is `status = cancelled` (12 unpaid, 11 paid, 4 pending). There are no live reservations.
- `src/pages/AdminDashboard.tsx:65` counts paid bookings as `payment_status = 'paid'` with **no status filter**, so the 11 cancelled-but-paid rows are still counted. That's the non-zero counter.
- `src/pages/Dashboard.tsx` (Property Pulse, `/dashboard/reports`) already excludes cancelled from `bookings`/`revenue`, but it then runs **gap interpolation, SMA smoothing and forecasting** over an all-zero series, so the chart still draws lines/projections even with no live bookings. It also plots a `cancellations` series.
- WordPress: the edge function and `WordPressTab.tsx` default to `2.1.0`, but the only registered property row in `integration_configs` still says `plugin_version: "2.0.1"` — the displayed version is stale, and the version is hardcoded in three places.
- API surface: `roomsonline-pms-api` exposes 52 actions. The docs page (`ApiDocsViewer.tsx`) lists 30 and the API Gates tab lists 40 — both are missing whole groups.

## Changes

### 1. Admin dashboard — paid bookings counter
- Add `.neq('status', 'cancelled')` (and exclude `failed`) to the paid-bookings count and to any revenue/total tiles built on the same query, so cancelled bookings never count as paid. Counter goes to 0 with current data.

### 2. Property Pulse — bookings graph
- Compute a "no live activity" flag: zero non-cancelled bookings in the selected range.
- When that flag is true, skip gap interpolation, SMA and forecast generation so the chart renders a genuinely flat/empty series instead of synthetic trend lines.
- Show a small "No live bookings in this period" empty-state note over the chart area; keep the cancellations series visible only when it has data (still useful, but clearly labelled).

### 3. API docs (`/dev` → sys control → API docs)
Rewrite `API_SECTIONS` in `ApiDocsViewer.tsx` to match all 52 live actions, grouped as:
- Availability & Rates (adds `set_rate_prices`, `create_rate_plan`, `create_rate_season`)
- Reservations
- Rooms & Room Types (`get_physical_rooms`, `create_physical_room`, `update_room_status`, `get_rolos_room_types`, `create_rolos_room_type`, `update_rolos_room_type`)
- Inventory (`update_inventory`, `check_inventory`, `backfill_inventory`)
- Guest CRM
- Operations (adds `assign_housekeeping_task`, `complete_housekeeping_task`)
- Folios & Charges (adds `process_checkout_refunds`, `get_booking_charges`)
- Webhooks (adds `get_webhook_logs`)
- Static Content (adds `get_property_profile`, `get_contact_details`)
- System

Also surface the API version returned by the function (`X-Api-Version: v1`) in the header, and note the rate-limit headers per response.

### 4. API UI Configurator alignment
- Extend `ACTION_GROUPS` in `ApiGatesTab.tsx` to the same full action list (adds Static Content and Webhooks groups plus the missing rate/property actions) so no live endpoint is un-gateable.
- Drive both the docs page and the gates tab from **one shared action catalogue** (`src/config/rolosApiActions.ts`) so they can't drift again.
- Show the current API version (`v1`) in the configurator header.

### 5. WordPress plugin version
- Introduce a single source of truth constant for the plugin version and use it in the edge function, `WordPressTab.tsx` and the push-update button (currently three separate literals, one label reading "n").
- Confirm the shipped plugin version is **2.1.0** (white-label + `[rolos_portfolio_booking]` shortcode) and update the stale `integration_configs` row from `2.0.1` to `2.1.0` so the Integrations tab reports correctly.

## Technical notes
- Counter and graph changes are frontend-only; no schema changes.
- The plugin-version correction is a data update to `integration_configs` (insert/update tool, not a migration).

## One open item
Your message ends mid-sentence with "the WP" — tell me what else you wanted on the WordPress side and I'll fold it in.
