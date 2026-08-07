# Backward Compatibility Contract — Unified Rate Plans (Phase 2 schema)

Date: 2026-08-07
Migration: unified Rate Plans data model (additive only)
Verification: `scripts/verify-rate-compat.sql`

## What the migration did

Additive only:

- New tables: `rolos_shared_seasons`, `rolos_rate_plan_season_rates`.
- New optional columns: `rolos_rate_plans` (`deleted_at`, `portfolio_id`, `plan_scope` default `'property'`), `rolos_rate_plan_room_types` (`is_active` default `true`, `deleted_at`, `differential_type` default `'none'`, `differential_value`, `sort_order`), `rolos_rate_prices` (`is_active` default `true`, `deleted_at`).
- New indexes only (no index dropped or replaced).
- New view `rolos_v_rate_plan_season_prices` (`security_invoker`), not referenced by any code.
- New trigger `trg_mirror_rate_plan_season_rate` on the **new** table only — it writes into `rolos_rate_prices`. It cannot fire until application code starts writing to `rolos_rate_plan_season_rates`, which no code does yet.

No column was altered, renamed, re-typed, made NOT NULL without a default, or dropped. No existing trigger, policy, function or view was modified. No data was migrated.

## Why every existing reader is unaffected

Readers use `select` lists that name columns explicitly (PostgREST and the Supabase client), so new columns are invisible to them. New tables are empty. New defaults reproduce the previously implicit behaviour (`is_active = true`, `deleted_at IS NULL`).

| Reader | Reads | Why it still works |
| --- | --- | --- |
| `supabase/functions/_shared/rateResolution.ts` | `rolos_rate_plan_room_types` + joined `rolos_rate_plans`, `rolos_rate_plan_stop_sell`, `rolos_rate_seasons`, `rolos_rate_prices`, `hostfully_room_types`, `properties.amenities` | Explicit column lists; no filter on the new flags. New link index only speeds up its `.in("room_type_id", ...)` lookup. |
| `booking-orchestrator-api` | calendar seasons in `properties.amenities`, rack rates via `rolos_rate_plans`, stop-sell | Calendar remains the season configurator; untouched. |
| `booking-portfolio-api` | 4-tier starting-rate aggregate + shared resolver shadow compare | Legacy aggregate unchanged; parity path already gated by `rate_resolution_mode`, still `legacy` for all properties. |
| `modify-booking` | `rolos_rate_plans`, `rolos_rate_prices` joined to `rolos_rate_seasons` | Same query, same rows. `rolos_rate_prices` is empty and all existing rows (if added) default to active. |
| `push-property-to-ru` | resolver output (calendar → rate plan → rack → unit daily) | Consumes the resolver, which is unchanged in this migration. |
| `pms-channel-sync` | `rolos_rate_plans`, plan/room links | Explicit column list; link rows all `is_active = true`. |
| `pms-financial` | `rolos_rate_plans` for invoice/folio rate labels | Unchanged shape. |
| `roomsonline-pms-api` (developer REST API) | rate plans, links, seasons for the `rates` resource | Response shape derived from named columns only; no new field leaks into the public contract. |
| `hydrate-pms-cache-to-rolos` | writes `rolos_rate_plans`, `rolos_rate_plan_room_types` | Inserts omit the new columns and take the defaults, so hydrated rows stay visible exactly as before. |
| `pricelabs-api`, `_shared/revenueStreams.ts`, `help-assistant` | rate plan reads for suggestions / reporting / context | Read named columns; unaffected. |
| `PropertyForm.tsx` / `RateManagerTab` (Admin, non-ROL'OS only) | `properties.amenities.seasons` + `season_rates`, `rolos_rate_plans` | Calendar JSONB untouched; the tab remains hidden for ROL'OS properties (`rolosManaged`). |
| `PMSRatePlans.tsx`, `RateStrategiesTable/Dialog`, `ViewRatesDialog`, `QuickBookDrawer`, `ModifyBookingModal`, `BulkStopSellDialog`, `RatePlanStopSellDialog` | `rolos_rate_plans`, links, seasons, prices, stop-sell | All use named-column selects and `is_active` on the rate plan only, which was not changed. |
| `CalendarAccommodation.tsx`, `RoomAvailabilityCalendar`, `ShowcaseAvailabilityCalendar` | calendar seasons + `season_rates` JSONB | Season ownership stays with the Calendar; nothing moved. |
| `EmbedProperty.tsx`, `EmbedPortfolio.tsx`, `Booking.tsx`, `PropertyShowcase.tsx` | rates via the booking/portfolio edge functions | Served values come from the legacy paths above. |
| `SpecialWizard`, `ChargeCalculator.ts`, `ReservationPolicyDialog` | rate plan identity and pricing model | Fields unchanged. |
| Reporting / billing / commissions (`rol_revenue_ledger`, `billing_*`, `rep_commission_*`) | booking-time stored amounts, not live rate tables | Never read the new tables; booking totals are historical values. |
| `src/integrations/supabase/types.ts` | generated types | Regenerated additively; existing property names and types are unchanged. |

## Rules that stay in force

1. The Calendar (`properties.amenities.seasons` / `season_rates`) remains the only season configurator. `rolos_shared_seasons` mirrors it via `calendar_season_id` and must never be edited independently.
2. `properties.rate_resolution_mode` remains the per-property kill switch. All properties are `legacy`.
3. `rolos_rate_prices` keeps being populated (directly or by the mirror trigger) for as long as any reader queries it.
4. Soft delete is `deleted_at IS NOT NULL`. Readers that do not filter it keep working because nothing is soft-deleted yet; any future writer that soft-deletes must first confirm every reader filters on it.

## What would break this contract later (not in this phase)

- Repointing a reader to `rolos_v_rate_plan_season_prices` without confirming parity in `rolos_rate_resolution_audit`.
- Making any new column NOT NULL without a default.
- Writing `rolos_rate_plan_season_rates` rows that only carry a differential (no `base_rate`) for a legacy season — those cannot be mirrored into `rolos_rate_prices` and would be invisible to legacy readers.
- Soft-deleting `rolos_rate_plan_room_types` rows before the resolver filters `is_active`.
