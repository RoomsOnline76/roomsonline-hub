# Unified Rate Plans — Data Model (Phase 2, schema only)

Additive schema + compatibility layer only. No UI, no calculation changes, no repointing of existing readers.

## What already exists (verified)

- `rolos_rate_plans` (42 rows) — already the commercial rate product table, already has `is_active`, `pricing_model`, `base_rate`, occupancy tiers, deposit and breakfast fields, plus the Phase 1 columns `pricing_model_normalised`, `min_stay_authority`, `source_of_truth`.
- `rolos_rate_plan_room_types` (65 rows) — the unit link table. Has `link_source`, unique on `(rate_plan_id, room_type_id)`. No `is_active`, no soft delete, no per-unit differential.
- `rolos_rate_seasons` (3 rows) — season windows, but scoped to a **single** `rate_plan_id`, so a season cannot be shared across properties.
- `rolos_rate_prices` (0 rows) — season x room type price rows, no `is_active`, no soft delete, no differential support.
- Calendar (`properties.amenities.seasons` / `season_rates`) is still the live season configurator and stays that way.
- `properties.rate_resolution_mode` kill switch exists; 0 properties are on `unified`.

Because the target tables already exist under `rolos_*` names, the migration extends them rather than creating a parallel `rate_plans` set. That avoids a second source of truth and keeps every current reader untouched.

## New tables

**`rolos_shared_seasons`** — the portfolio-level season catalog that enables the Jongensfontein pattern.

- `portfolio_id` (FK `property_portfolios`, nullable), `property_id` (FK `properties`, nullable — one of the two is required)
- `name`, `start_date`, `end_date`, `is_peak`
- `source` (`calendar` | `manual`), `calendar_season_id` — the calendar remains the owner; rows are a mirror keyed back to the calendar season, never an independent editor
- `is_active`, `deleted_at`
- No date-range exclusion constraint: overlapping windows across portfolios are legitimate.

**`rolos_rate_plan_season_rates`** — seasonal pricing attached to a rate plan, with per-unit granularity.

- `rate_plan_id` (FK `rolos_rate_plans`, required)
- `shared_season_id` (FK `rolos_shared_seasons`, nullable) and `legacy_season_id` (FK `rolos_rate_seasons`, nullable) — one of the two required, so both season worlds can be expressed
- `room_type_id` (FK `rolos_room_types`, nullable). `NULL` = applies to every unit linked to the plan; a row with a unit wins over the `NULL` row.
- `base_rate`, `extra_adult_rate`, `extra_child_rate`
- `differential_type` (`none` | `amount` | `percent`) + `differential_value` — a unit can be priced as "shared season base +R250" or "+10%" instead of restating an absolute rate
- `is_active`, `deleted_at`, timestamps

## Additive columns

- `rolos_rate_plan_room_types`: `is_active` (default true), `deleted_at`, `differential_type`, `differential_value`, `sort_order`.
- `rolos_rate_plans`: `deleted_at`, `portfolio_id` (nullable, for plans shared across a portfolio), `plan_scope` (`property` default | `portfolio`).
- `rolos_rate_prices`: `is_active` (default true), `deleted_at` — defaults chosen so every existing row stays visible to current readers with no backfill semantics change.

All new columns are nullable or carry a default that matches today's implicit behaviour.

## Compatibility layer

- **View `rolos_v_rate_plan_season_prices`** — emits the exact column shape of `rolos_rate_prices` (`season_id`, `room_type_id`, `base_rate`, `extra_adult_rate`, `extra_child_rate`) as a union of live `rolos_rate_prices` rows and active `rolos_rate_plan_season_rates` rows resolved through `legacy_season_id`. `security_invoker`, so RLS still applies. Nothing is repointed to it in this phase.
- **Dual-write trigger** on `rolos_rate_plan_season_rates`: when a row carries a `legacy_season_id` and a `room_type_id`, upsert the matching `rolos_rate_prices` row so the existing shared resolver tier and any current reader keeps seeing the price without code change. Deletes/soft-deletes mirror through as a soft delete on the legacy row.
- The Phase 1 `rolos_v_effective_rates` view and `rate_resolution_mode` kill switch stay as they are.

## Indexes (matching queries booking and ARI already run)

- `rolos_rate_plan_season_rates(rate_plan_id, shared_season_id)` and `(rate_plan_id, legacy_season_id)`
- `rolos_rate_plan_season_rates(room_type_id)` partial `WHERE deleted_at IS NULL`
- unique `(rate_plan_id, shared_season_id, legacy_season_id, room_type_id)` where not deleted
- `rolos_shared_seasons(portfolio_id, start_date, end_date)` and `(property_id, start_date, end_date)`
- `rolos_rate_plan_room_types(room_type_id)` — the resolver's `.in("room_type_id", ...)` lookup currently has no supporting index
- `rolos_rate_plans(property_id, is_active)` partial `WHERE deleted_at IS NULL`
- `rolos_rate_prices(room_type_id)`

## Access rules

Every new table: GRANT to `authenticated` and `service_role` (no `anon`), RLS enabled, policies scoped through the existing `can_access_property` / portfolio membership helpers, mirroring the policies already on `rolos_rate_plans`.

## Deliverables besides the migration

1. **`docs/rates-backward-compatibility-contract.md`** — one row per existing reader (`_shared/rateResolution.ts`, `booking-orchestrator-api`, `booking-portfolio-api`, `modify-booking`, `push-property-to-ru`, `pms-channel-sync`, `pms-financial`, `check-activation-readiness`, reporting/billing/commission paths, `RateManagerTab` and the ROL'OS rate plan UI) stating which table/column it reads, why this migration cannot change its result, and what would have to change later.
2. **`scripts/verify-rate-compat.sql`** — read-only checks proving old data still reads identically: row counts per rate table before/after, `rolos_rate_prices` legacy projection equals the compatibility view for legacy-season rows, every existing plan and link still visible under the new `is_active`/`deleted_at` defaults, no new NOT NULL without default, and `rate_resolution_mode` still `legacy` for all properties.

## Explicitly out of scope this step

No UI change, no pricing/calculation change, no writes into the new tables from application code, no repointing of any reader, no data migration of the 89 `amenities.seasons` properties.
