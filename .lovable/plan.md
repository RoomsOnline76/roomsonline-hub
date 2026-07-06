## Goal
Add **Rate Strategies** to ROLOS Revenue Management: assign a rate plan to specific weekdays over a date range (Protel-style "Add Rate Strategy"), and view all strategies in a table (Protel2-style list).

## Where
New tab **Rate Strategies** in `src/pages/pms/PMSRevenue.tsx`, alongside the existing Yield Rules tab.

## Schema
New table `public.rolos_rate_strategies`:
- `id uuid pk`
- `property_id uuid → properties(id) ON DELETE CASCADE`
- `name text not null`
- `rate_plan_id uuid → rolos_rate_plans(id) ON DELETE CASCADE` (nullable → "All rate plans")
- `room_type_id uuid → rolos_room_types(id) ON DELETE CASCADE` (nullable → "All room types")
- `season_id uuid → rolos_rate_seasons(id) ON DELETE SET NULL` (nullable — optional shortcut to fill date range)
- `start_date date not null`
- `end_date date not null`
- `weekdays int[] not null default '{0,1,2,3,4,5,6}'` (0=Sun … 6=Sat)
- `min_occupancy int` (nullable) / `max_occupancy int` (nullable)
- `adjustment_type text not null default 'percent'` (`percent` | `fixed`)
- `adjustment_value numeric not null default 0` (positive = increase, negative = decrease)
- `only_on_arrival boolean default false`
- `booking_window_from date`, `booking_window_to date` (nullable — matches Protel "Only if booking date is")
- `priority int not null default 10`
- `is_active boolean not null default true`
- `created_at`, `updated_at`, `created_by`
- RLS: mirror `rolos_rate_plans` (`is_property_owner`, `is_linked_owner`, admin/dev/fearless_leader). GRANTs `authenticated` + `service_role`.

## UI

### Add / Edit dialog (`RateStrategyDialog.tsx`)
Three-column layout mirroring the Protel screenshot:
- **Info**: Name.
  Seasonal Availability = start/end date pickers (with an optional "Load from season" dropdown that autofills dates from `rolos_rate_seasons`).
- **Scopes**: Room type dropdown (defaults "All"), Occupancy min/max (optional), Rate Plan dropdown (defaults "All active plans" — replaces Protel's Rate Group + Rate Code since ROLOS models these as one entity).
- **Availability**: Su–Sa weekday checkboxes, "Only on arrival" checkbox, "Only if booking date is" range (booking_window_from/to).
- **Strategy**: adjustment type (Percent / Fixed) + value with +/− sign; priority.
- Portfolio mode: reuse `PropertyScopeSelector` to fan the strategy out to sibling properties (resolve rate plan by `code`, room type by name).

### Table view (`RateStrategiesTable`)
Columns: Name · From · To · Weekday · Rate Plan · Room Type · Occupancy · Restriction (e.g. `Percentage of -5.00`, `Fixed +R100`) · By Arrival · Active toggle · Row actions (edit, duplicate, delete). Sortable by From date (default). Search box for name.

### Rate Plan card quick link
On each rate plan card in `PMSRatePlans.tsx`, add a small "Strategies (n)" chip that opens the Rate Strategies tab pre-filtered to that plan.

## Engine hookup
`booking-orchestrator-api` when calculating a nightly rate for a plan:
1. Load active `rolos_rate_strategies` for the property whose `start_date/end_date` bracket the night, weekday in `weekdays`, plan match (`rate_plan_id` null or equal), room match (null or equal), booking-window match, arrival-only match (only on the arrival night), occupancy match against snapshot occupancy for that night.
2. Sort by `priority ASC`, apply adjustments in order (percent applies to running rate, fixed adds after).
3. Rates flagged by a strategy get a `strategy_id` marker so the calendar can badge them.

Calendar rate row (existing rate-plan row in `PMSDashboard.tsx`) shows a small tooltip when a strategy is applied.

## Files
- New: `supabase/migrations/<ts>_rate_strategies.sql`
- New: `src/components/revenue/RateStrategyDialog.tsx`
- New: `src/components/revenue/RateStrategiesTable.tsx`
- `src/pages/pms/PMSRevenue.tsx` — add "Rate Strategies" tab, wire table + dialog
- `src/pages/pms/PMSRatePlans.tsx` — add "Strategies (n)" chip on each card
- `supabase/functions/booking-orchestrator-api/index.ts` — honour strategies in nightly rate calc

## Out of scope
- Channel manager push of strategy-adjusted rates (follow-up)
- Historical strategy analytics
