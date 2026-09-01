# Rate stay-quote Phase 0 — LOS / Full Stay contract

Add the contract only: additive schema, a pure `stayQuote()`, loader and save plumbing. No guest-visible total, channel payload, or calendar cell changes. Every existing plan stays on the nightly path because both new flags default to false and both new tables start empty.

## 1. Schema (additive, backfill-safe)

Single migration:

- `rolos_rate_plans`: `los_enabled boolean not null default false`, `fsp_enabled boolean not null default false`.
- New table `rolos_rate_plan_los_rungs` — one nights threshold per plan, optional unit (`room_type_id`), optional window (`calendar_season_id` or `start_date`/`end_date`), `nights >= 1`, `derivation_type in ('percent','amount')`, `derivation_value`, `is_pinned`, `pinned_rate` (nightly), timestamps + updated_at trigger.
- New table `rolos_rate_plan_fsp_cells` — one stay-total cell per plan: same window/unit keys plus `nights >= 1`, `nr_of_guests >= 1`, nullable derivation pair, `is_pinned`, `pinned_total`.
- Both: check that a season id or a full explicit window is present; unique key over (plan, unit, season, start, end, nights[, guests]).
- Both: GRANTs (`authenticated`, `service_role`), RLS enabled, policies copied from the `rolos_rate_plan_season_rates` property-scoped family — no looser rule.
- No backfill, no JSONB ladder, no write to `properties.amenities.season_rates`.

## 2. Pure engine — `supabase/functions/_shared/ratePricing.ts`

- Add types `StayQuoteShape`, `LosRung`, `FspCell`, `StayQuoteInput`, `StayQuote`; add `los_enabled?`/`fsp_enabled?` to `PricingRatePlan` (default false); add optional `losRungs` / `fspCells` to `PricingInputs`, keyed by `linked_rolos_id` exactly like `planSeasonRates`, defaulted to `{}` in `normalizePricingInputs`.
- `stayQuote(inputs, unit, plan, stay)` selection order:
  1. Nights via `eachDatePure`; nightly series via `resolveNightRates`.
  2. Short/uncovered series → unpriced stay (`stay_total: 0`, `nightly: []`, shape `nightly`). Never gap-filled from LOS/FSP.
  3. Full stay when `fsp_enabled` and a cell matches nights + guests (`adults + teens + children`) + window (arrival season first, then explicit range) + unit (`null` or matching `linked_rolos_id`): pinned → `pinned_total`, derived → `applyDerivation(stayTotalForModel(...))`; `nightly: null`.
  4. Else LOS when `los_enabled` and a rung matches window/unit with `nights >= rung.nights` (highest threshold wins): pinned replaces every nightly, derived applies per nightly; then `stayTotalForModel`; shape `los_nightly`.
  5. Else nightly: `stayTotalForModel` on the raw series.
- Reuse `applyDerivation` / `roundDerived`. Stays pure: no supabase, fetch, clock, or input mutation.
- `canonicalPricingModel('per_stay')` keeps returning `per_room` — untouched.

## 3. Loader — `_shared/rateResolution.ts`

Select the two flags on the existing rate-plan join; load rungs and cells in one query each for the property's plan ids and attach keyed like `planSeasonRates`. Missing tables or query errors are treated as empty so the nightly path survives a preview branch without the migration. No new HTTP action; preview actions stay on `resolveNightRates`.

## 4. Save path — `rolos-rate-plans` + draft types

Accept optional `los_enabled`, `fsp_enabled`, `los_rungs`, `fsp_cells`. Absent keys are a strict no-op (no flag flip, no child-row deletion) so today's editor payload is unaffected. Present keys replace that plan's child rows in one delete+insert, same pattern as season rates, after validating window presence, uniqueness, and pinned-vs-derived exclusivity — invalid ladders return 400 with a plain message and save nothing. `RatePlanDraft`/`draftToPayload` gain the four fields with defaults `false` / `[]`. No new controls in `RatePlanEditor.tsx`.

## 5. Tests

New `supabase/functions/_shared/stayQuote.test.ts` covering: empty config equals `stayTotalForModel` (per_room and per_person); LOS percent rung; LOS threshold miss falls back; LOS pinned with occupancy still applied; FSP pinned cell; FSP cell miss; one unpriced night wins over an FSP cell; each flag off ignores its rows. All existing `ratePricing`, `ratePricingGate`, `pricingModel` and `ratePlanDraft` assertions stay unchanged and green.

## 6. Out of scope (later scoops)

Calendar sheet/badges, booking orchestrator / embeds / widgets / modify-booking switching to `stayQuote()`, RU `push_prices_fsp` or `<LOSS>` wiring, cert-portal playground, help copy, new Rate Plans UI sections, portfolio ladder sync, PriceLabs.

## 7. Acceptance

Flags exist and default false; new tables empty with RLS and grants; a 3-night per_room quote matches today's total exactly; new and old tests green; no diff in `push-property-to-ru`, RU price builders, `Booking.tsx`, `EmbedProperty.tsx`, `SeasonsCalendar.tsx`, `CalendarAccommodation.tsx`, or the editor chrome.
