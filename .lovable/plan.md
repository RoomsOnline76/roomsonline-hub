## Goal
Allow date-range Stop Sell to be applied to a specific **rate plan** (not just a room). Reachable from both the Rate Plans page and the Dashboard Bulk Stop Sell dialog.

## Schema
New table `public.rolos_rate_plan_stop_sell`:
- `id uuid pk`
- `property_id uuid → properties(id)`
- `rate_plan_id uuid → rolos_rate_plans(id) ON DELETE CASCADE`
- `date date not null`
- `created_at`, `created_by`
- `UNIQUE(rate_plan_id, date)`
- RLS: staff of the property can read/write (mirror `rolos_rate_plans` policies). GRANTs for `authenticated` + `service_role`.

Rationale: `property_availability` is keyed on `(room_type, date, external_system)` and has no rate-plan concept, so a dedicated closure table is cleaner and avoids polluting the ARI cache.

## UI

### 1. Rate Plans page (`src/pages/pms/PMSRatePlans.tsx`)
- Add a **Stop Sell** action on each rate-plan card (kebab menu or button next to the Active switch).
- Opens a new `RatePlanStopSellDialog` with:
  - Date-range picker (from / to)
  - Read-only rate plan name
  - Existing closures list for that rate plan (chips with X to remove)
  - Property Scope selector (reuse `PropertyScopeSelector`) shown when in Portfolio mode, so the same rate-plan-code closure can be applied across sibling properties that own a plan with the same `code`. Resolve target rate-plan IDs by `code` per property.
- Save = upsert one row per date × target rate plan.

### 2. Dashboard `BulkStopSellDialog` (`src/components/BulkStopSellDialog.tsx`)
- Add a **"Apply to"** segmented control: `Rooms` (existing) / `Rate plan`.
- When `Rate plan` is selected:
  - Hide the rooms list, show a rate-plan dropdown (fetched via `rolos_rate_plans` for the target property/properties, filtered to `is_active`).
  - Write to `rolos_rate_plan_stop_sell` instead of `property_availability`.
  - Existing Property Scope selector continues to work; multi-property writes resolve by rate plan `code`.
- Toast summarises `dates × rate plans × properties`.

## Booking / ARI enforcement
- `booking-orchestrator-api` (and the ARI resolver it uses): when evaluating a rate plan for a date, join `rolos_rate_plan_stop_sell`; if a row exists for `(rate_plan_id, date)` in the requested range, treat that plan as closed (exclude from returned rate options, block checkout with `NO_BOOKING_FROM_CACHE`-compatible reason `RATE_PLAN_CLOSED`).
- Calendar rate row rendering: mark cells as closed for that rate plan (grey pill with lock icon) — small addition in the existing rate row in `PMSDashboard`/`CalendarAccommodation` where rate-plan rows are drawn.

## Files to change
- New: `supabase/migrations/<ts>_rate_plan_stop_sell.sql`
- New: `src/components/restrictions/RatePlanStopSellDialog.tsx`
- `src/pages/pms/PMSRatePlans.tsx` — add action + dialog wiring
- `src/components/BulkStopSellDialog.tsx` — mode switch + rate-plan write path
- `src/pages/pms/PMSDashboard.tsx` — pass rate-plan list into dialog
- `supabase/functions/booking-orchestrator-api/index.ts` — honour new closures
- Optional calendar tint: `src/pages/pms/PMSDashboard.tsx` / `CalendarAccommodation.tsx`

## Out of scope
- No changes to `property_availability`, rates, or channel-manager push (channel mapping of rate-plan closures can be layered in a follow-up).
