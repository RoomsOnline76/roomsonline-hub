# Rates & Pricing: Current State Map + Safe Evolution Plan

Investigation only — no code in this step. Every claim below was confirmed by reading the code and querying the live database.

## 1. Current state map

### Where rate data physically lives (verified live counts)


| Store                                                                 | Live volume                           | Verdict                                                                      |
| --------------------------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| `properties.amenities.seasons` / `.season_rates` (JSONB)              | 89 / 87 properties                    | **De facto source of truth for seasonal + nightly pricing**                  |
| `properties.amenities.pms_rate_types` (JSONB)                         | populated                             | Mirror of `rolos_rate_plans`, kept in step by a DB trigger *and* by app code |
| `rolos_rate_plans`                                                    | 42 rows / 18 properties               | Rate-plan identity + rack rate + `min_stay`                                  |
| `rolos_rate_plan_room_types`                                          | 65 rows / 10 plans                    | Unit-type linking                                                            |
| `rolos_rate_seasons`                                                  | 3 rows / 1 plan                       | Barely adopted                                                               |
| `rolos_rate_prices`                                                   | **0 rows**                            | Never populated — dead in practice                                           |
| `rolos_rate_plan_stop_sell`                                           | 182 rows / **1 property**             | Only store for date closures; adopted by one property                        |
| `hostfully_room_types.daily_rate` / `min_stay` / `max_stay`           | 768 rows; 109 rated, 57 with min_stay | Legacy per-unit mirror, last-resort fallback                                 |
| `pms_rate_types_cache`                                                | 12 rows / 11 properties               | Raw external-PMS rate mirror                                                 |
| `property_rates`                                                      | **0 rows**                            | Dead legacy table                                                            |
| `rolos_rate_strategies` / `rolos_yield_rules` / `rolos_pricing_rules` | **0 rows each**                       | Admin UI exists, no engine reads them, nothing configured                    |
| `rolos_booking_room_nights`                                           | **0 rows**                            | Per-night override store exists but has never been written                   |
| `pricelabs_price_suggestions`                                         | **0 rows**                            | Integration wired, not yet in use                                            |
| ROLOS-native properties (`properties.is_rol_property`)                | 37 properties                         | Scope of the "hide admin rate editor" change                                 |


### Exact source of truth per concept

**Base / nightly rate** — `rolos_rate_plans.base_rate` is the rack rate, resolved through `supabase/functions/_shared/rateResolution.ts`. Competing stores: `hostfully_room_types.daily_rate` (final fallback), `rolos_room_types.default_rate` (read only by `booking-portfolio-api`), `amenities.pms_rate_types[].baseRate` (JSONB mirror).

**Seasonal rates** — `properties.amenities.seasons` + `.season_rates`, authored in the admin Calendar (`SeasonsCalendar`, reachable from both `CalendarAccommodation.tsx` and `RateManagerTab`). The relational pair `rolos_rate_seasons` + `rolos_rate_prices` models the same concept but is empty, so it contributes nothing today.

**Min / max stay** — no single authority. Five stores, none of them merged by a shared normaliser:

1. `rolos_rate_plans.min_stay` / `max_stay` — authored in `PMSRatePlans.tsx`, read by the resolver and channel push.
2. `rolos_rate_seasons.min_stay_override` — per-season override, read only where relational seasons are consulted.
3. `hostfully_room_types.min_stay` / `max_stay` — 57 units populated, written by `PropertyForm.tsx` and by PMS ingestion; used by unit-level availability and RU push.
4. `amenities.room_types[].minStayDays` / `maxStayDays` — JSONB per-room-type, normalised on load in `PropertyForm.tsx`.
5. `amenities.seasons[].minStay` — per-season JSONB, surfaced in resolver season entries.
  Effective behaviour: whichever store the calling path happens to read wins. This is the single most fragmented concept in the system and the highest-value thing to unify.

**Unit-type linking** — `rolos_rate_plan_room_types.room_type_id` → `hostfully_room_types.id` is the formal link (65 rows). It is bridged to native rooms by `hostfully_room_types.linked_rolos_id` → `rolos_room_types.id` (198 units linked). Where no explicit link row exists, resolvers fall back to ad-hoc key matching on amenity room id, linked ROLOS id, or room name — the match method is not recorded anywhere, so it cannot be audited.

**Rate plan identity** — `rolos_rate_plans.id`, with `code` as the human/channel-facing identifier and `pricing_model`, `breakfast_included/amount/basis` as behavioural attributes. Two shadow identities exist: `amenities.pms_rate_types[]` (JSONB mirror, bidirectionally synced by a DB trigger) and `pms_rate_types_cache.external_rate_type_id` (the external PMS's own plan id). `pricing_model` is not normalised — live values include `per_room`, `per_person`, `per-unit` and `UnitRate` in the same column.

**Stop-sell / closed dates** — `rolos_rate_plan_stop_sell` (property + rate plan + date) is the sole store, with no JSONB duplicate. Written by `BulkStopSellDialog` and `RatePlanStopSellDialog`; read by `booking-orchestrator-api` and by `_shared/rateResolution.ts` to build `closedDates`. Closures are a closure signal, never a price. Adoption is one property (182 dates).

**Daily overrides** — `rolos_booking_room_nights` (booking, room, stay date, rate, `rate_plan_id`, `is_override`) is the intended store for the rate actually charged per night, including manual overrides and "fill to the right". It is currently **empty**, and the only code path that reads or writes it is the admin `ViewRatesDialog`. Confirmed gap: the booking creation path does not populate it, so there is no per-night ledger of charged rates for existing bookings — reporting derives nightly value from booking totals instead.

### Two confirmed architectural drifts

1. **Split season pricing.** `_shared/rateResolution.ts` (used by `booking-orchestrator-api`, embeds, showcase) reads *only* the JSONB calendar seasons. `booking-portfolio-api` reads *only* `rolos_rate_prices` → `rolos_rate_plans.base_rate` → `rolos_room_types.default_rate` → `hostfully_room_types.daily_rate` and never the JSONB. Because `rolos_rate_prices` is empty, the portfolio/multi-property path serves flat rack rates today while the single-property path serves calendar season rates. This is live inconsistency, not theory.
2. **Configured-but-unread revenue layer.** `rolos_rate_strategies`, `rolos_yield_rules` and `rolos_pricing_rules` have full admin CRUD and no engine consumer. All three are empty, so nothing is mispriced today, but the UI implies they work.

### UI surfaces that write rate data

- `src/pages/PropertyForm.tsx` → `RateManagerTab` (with `SeasonsCalendar`, `PoliciesTab`, `RatesOverviewPanel`): writes `amenities.seasons/season_rates/pms_rate_types`, `hostfully_room_types.daily_rate/min_stay/max_stay`, and mirror-upserts `rolos_rate_plans` + `rolos_rate_plan_room_types`.
- `src/pages/pms/PMSPropertySetup.tsx` embeds that **same** `PropertyForm` (`embedded` + `forceTabsOverride`, defaulting to the `rates` tab) — the ROLOS "rates" hub is the admin editor, not a separate implementation.
- `src/pages/pms/PMSRatePlans.tsx` — the only relational Rate Manager: `rolos_rate_plans`, `rolos_rate_plan_room_types`, `rolos_rate_seasons`, `rolos_rate_prices`.
- `src/pages/CalendarAccommodation.tsx` → `SeasonsCalendar` — seasons into JSONB.
- `RateStrategyDialog`, `RateStrategiesTable`, `PMSRevenue`, `PMSPriceLabs`, `BulkStopSellDialog`, `RatePlanStopSellDialog`, `ViewRatesDialog`.
- Server-side writers: `roomsonline-pms-api`, `pms-channel-sync`, `hydrate-pms-cache-to-rolos`, `sync-rolos-room-types`, `pricelabs-api`, `ru-cert-portal`, `sync-rates-availability`, plus the `rolos_rate_plans` ⇄ `amenities.pms_rate_types` DB trigger.
- ROLOS identity is decided three ways: `isRolosPms` in `src/lib/pmsUtils.ts`, a broader `isRolosPms` in `src/lib/pmsIdentity.ts`, and the `properties.is_rol_property` column.

## 2. Every consumer that reads rate data

Break risk: **HIGH** = shape change breaks it without a compatibility layer; **MED** = degrades or drifts silently; **LOW** = reads a derived/decoupled value.

### Edge functions — booking & ARI


| Consumer                                                                                                                                                                         | Reads                                                                                                                                              | Break risk                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `_shared/rateResolution.ts`                                                                                                                                                      | `amenities.seasons/season_rates`, `rolos_rate_plans`, `rolos_rate_plan_room_types`, `rolos_rate_plan_stop_sell`, `hostfully_room_types.daily_rate` | **HIGH** — the shared resolver; every other path inherits its behaviour |
| `booking-orchestrator-api` 🔒                                                                                                                                                    | resolver + stop-sell + live PMS ARI                                                                                                                | **HIGH** — adapter-locked, `NO_BOOKING_FROM_CACHE`                      |
| `booking-portfolio-api`                                                                                                                                                          | `rolos_rate_prices` → `rolos_rate_plans.base_rate` → `rolos_room_types.default_rate` → `hostfully_room_types.daily_rate`                           | **HIGH** — own divergent hierarchy                                      |
| `modify-booking`                                                                                                                                                                 | `rolos_rate_plans`, `rolos_rate_seasons`, `rolos_rate_prices`                                                                                      | **HIGH**                                                                |
| `push-property-to-ru` 🔒                                                                                                                                                         | calendar seasons + rack rate for the 365-day price push                                                                                            | **HIGH** — adapter-locked                                               |
| `pms-channel-sync`                                                                                                                                                               | `rolos_rate_plans.base_rate`, `rolos_rate_plan_room_types`                                                                                         | **HIGH**                                                                |
| `hostfully-api` 🔒, `beds24-api` 🔒, `nightsbridge-reservations-sync` 🔒, `ru-reservation-handler` 🔒, `hyperguest-api`, `cloudbeds-api`, `little-hotelier-api`, `hotelbeds-api` | `pms_rate_types_cache`, `hostfully_room_types` rate fields                                                                                         | **HIGH** for locked files; MED elsewhere                                |
| `sync-rates-availability`                                                                                                                                                        | `property_rates` (empty)                                                                                                                           | LOW                                                                     |


### Edge functions — API, AI, finance


| Consumer                                                                | Reads                                                                                                     | Break risk                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `roomsonline-pms-api` (public REST v3.1)                                | `rolos_rate_plans`, `rolos_rate_seasons`, `rolos_rate_prices`, `pms_rate_types_cache`, `property_charges` | **HIGH** — external developers and the WordPress plugin depend on the response shape |
| `_shared/packages.ts`                                                   | `rolos_packages`, `rolos_package_components` on top of resolved rate                                      | **HIGH**                                                                             |
| `_shared/revenueStreams.ts`                                             | `rolos_rate_plans.breakfast_*`, `property_charges`                                                        | **HIGH** — accommodation vs F&B split                                                |
| `_shared/ruDiscounts.ts`                                                | `property_specials` layered on resolved rate                                                              | MED                                                                                  |
| `pms-night-audit`                                                       | rate-plan breakfast fields, folio charges                                                                 | **HIGH** — posts nightly revenue                                                     |
| `pms-financial`                                                         | booking totals, folio, invoice values                                                                     | MED                                                                                  |
| `pricelabs-api`                                                         | `rolos_rate_plans`, `rolos_rate_seasons`, `rolos_rate_prices`                                             | MED (empty today)                                                                    |
| `ai-booking-concierge`, `help-assistant`                                | specials, rate plans for narrative                                                                        | LOW                                                                                  |
| `check-activation-readiness`                                            | rate coverage for the Pricing 365d check                                                                  | MED                                                                                  |
| `hydrate-pms-cache-to-rolos`, `sync-rolos-room-types`, `ru-cert-portal` | rate mirrors both ways                                                                                    | **HIGH** — they would fight a schema change                                          |
| `rolos-policy-metrics`                                                  | `bookings.rate_plan_id` → `rolos_policy_rate_links`                                                       | MED — depends on rate-plan identity staying stable                                   |


### Frontend

**HIGH** (price shown to a guest or pushed to a channel): `src/pages/Booking.tsx`, `PropertyShowcase.tsx`, `EmbedProperty.tsx`, `EmbedPortfolio.tsx`, `ShowcaseAvailabilityCalendar`, `RoomAvailabilityCalendar`, `EmbedAvailabilityGrid`, `QuickBookDrawer`, `public/rol-sdk.js` and the WordPress blocks (`src/wp-blocks/*`).

**MED** (internal operations): `PMSDashboard` (room plan rates), `PMSRooms`, `PMSRatePlans`, `PMSRevenue`, `PMSPriceLabs`, `ViewRatesDialog`, `ModifyBookingModal`, `RateStrategyDialog`, `RateStrategiesTable`, `BulkStopSellDialog`, `RatePlanStopSellDialog`, `ReservationPolicyDialog`, `SpecialWizard`, `RuCurrencyNotice`, `CalendarAccommodation`, `RatesOverviewPanel`, `RateManagerTab`, `usePropertyCharges`, `useActivePackages`, `useRevenueStreamTotals`.

**LOW**: `commissionResolver.ts` (resolves a percentage from `bookings.calculated_commission` → `property_commercial_terms` → billing config → global default; never reads rate tables), billing config surfaces, `usePublicPricing` (SaaS tier pricing, unrelated to accommodation rates).

**Not a consumer but a hazard:** the `rolos_rate_plans` ⇄ `amenities.pms_rate_types` DB trigger plus the app-level ROL-sync in `PropertyForm.tsx` are two independent sync mechanisms for the same mirror. Any additive column added to `rolos_rate_plans` must be ignored by both, or they will overwrite each other.

## 3. Safe Evolution Plan

**Governing principle:** nothing is dropped, renamed or retyped. No existing reader is edited to change behaviour. Every new field is nullable and every new code path is off by default. The old JSONB keeps being populated for the entire initiative.

### 3.1 Additive tables and columns only


| Change                                                                                                                                           | Purpose                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `rolos_rate_plans`: add `pricing_model_normalised`, `min_stay_authority`, `source_of_truth` (`rolos` / `mirror` / `external_pms`) — all nullable | Fixes the `per_room`/`per-unit`/`UnitRate` inconsistency and records which store owns min-stay, without touching the legacy columns |
| `rolos_rate_plan_room_types`: add `link_source` (`explicit` / `name_match` / `amenity_id`), nullable                                             | Makes today's implicit key matching auditable                                                                                       |
| New table `rolos_rate_resolution_audit` (property, unit, date, resolved rate, winning tier, resolver version, run id)                            | The parity safety net — proves old and new resolution agree before any surface switches                                             |
| New table `rolos_stay_restrictions` (property, optional rate plan, optional room type, date range, min stay, max stay, CTA/CTD, source)          | One canonical place for min/max stay, populated *from* the five existing stores; nothing reads it until a consumer opts in          |
| New view `rolos_v_effective_rates` (property, unit, date, rate, tier, currency)                                                                  | Gives reporting, readiness and future consumers one read shape without any consumer being forced to migrate                         |
| `properties`: add `rate_resolution_mode` (`legacy` default / `unified`), nullable                                                                | The per-property kill switch for the whole initiative                                                                               |


No `CREATE TABLE` here goes in without GRANTs to `authenticated` and `service_role` (plus `anon` only where a public read policy exists), RLS enabled, and policies scoped the same way as the sibling `rolos_*` tables.

### 3.2 How every existing reader keeps working

1. **Continued population of the old JSONB.** `amenities.seasons` / `.season_rates` / `.pms_rate_types` stay the written store. The Calendar remains the only season configurator. Rate Plans read seasons; they never own them.
2. **Continued population of the legacy mirrors.** `hostfully_room_types.daily_rate/min_stay/max_stay` and the `rolos_rate_plans` ⇄ `amenities.pms_rate_types` trigger keep running untouched, so the public REST API, WordPress plugin, RU push and every PMS adapter see exactly the values they see today.
3. **Dual-read behind a flag.** `_shared/rateResolution.ts` additively gains the relational season tier, making its published order: calendar season rate → `rolos_rate_seasons` override → rate-plan rack rate → unit daily rate. Because `rolos_rate_seasons` holds 3 rows on 1 plan and `rolos_rate_prices` is empty, this changes output for effectively no property while closing the drift.
4. **Shadow compare before switching.** `booking-portfolio-api` and `modify-booking` compute both their current hierarchy and the shared resolver, serve the *old* result, and write both into `rolos_rate_resolution_audit`. Only when a property shows zero deltas over a full 365-day window does its `rate_resolution_mode` move to `unified`.
5. **Views, not shape changes, for new readers.** Reporting, the readiness "Pricing 365d" check and any future surface read `rolos_v_effective_rates`. Existing readers are never repointed.
6. **Retire by non-use, never by deletion.** `rolos_rate_prices` and `property_rates` are empty; new writes stop targeting them, but tables, columns, grants and policies stay so existing reads keep returning empty exactly as they do now.
7. **UI unification is presentation-only.** For the 37 `is_rol_property` properties the detailed rate editor is hidden from Admin Edit Property and the ROLOS Rate Plans surface becomes the single entry point — writing the *same* tables and JSONB paths the hidden editor wrote. Admin keeps a read-only rates summary plus a break-glass override. Non-ROLOS properties keep the current editor unchanged.
8. **One identity helper.** A single helper consults `is_rol_property` first and `external_system` aliases second; `pmsUtils.ts` and `pmsIdentity.ts` re-export it so no call site changes meaning.
9. **Adapter locks respected.** Nothing in `.lovable/ADAPTER_LOCKS.md` is edited without separate explicit approval in the same turn. RU and channel push change only after the audit table shows parity.
10. **Revenue-layer tables (rolos_rate_strategies, rolos_yield_rules, rolos_pricing_rules)**  
→ **Label them inactive / “Coming later” in the UI now.**  
Do not activate or wire them into the engine in this initiative. They have zero rows and zero consumers. Leave the tables alone.
11.  **rolos_booking_room_nights (Phase E)**  
→ **Yes — start writing it for properties that flip to unified.**  
This is the correct long-term ledger. Existing bookings stay untouched. Reporting continues to fall back to totals when no night rows exist. This is a pure additive win.
12.  **PriceLabs**  
→ **Leave it alone for now.**  
It currently targets the empty relational tables and therefore has no live effect. Do not repoint it at the Calendar seasons until after the Rate Plans unification is stable and audited. Explicitly exclude it from this work.
13.  **Stop-sell (rolos_rate_plan_stop_sell)**  
→ **Keep it rate-plan-scoped.**  
It is already the cleanest store and is only used by one property. Do not fold it into the new rolos_stay_restrictions table in this phase. Closures stay as a separate signal.

### 3.3 Migration strategy for the 89 JSONB-season properties

**They are not migrated out of the JSONB.** The JSONB calendar remains their home, because the Calendar is the season configurator and it is the highest-priority tier in the resolver. What changes is only how consistently they are read.

- **Phase A — inventory (read-only).** For all 89 properties, project their JSONB seasons through the resolver across a rolling 365 days and record every day in `rolos_rate_resolution_audit`, tagged with the winning tier. Output: per-property coverage (days priced from calendar vs rack rate vs unit daily rate vs uncovered).
- **Phase B — gap closure.** Properties with uncovered days are surfaced in the readiness panel with the exact date ranges, so the owner or admin fills them in the Calendar. No automated rate is invented anywhere.
- **Phase C — restriction consolidation.** Populate `rolos_stay_restrictions` from all five min/max-stay stores, recording which store each row came from. Conflicts are reported, never auto-resolved; the existing stores stay authoritative until each conflict is settled in the UI.
- **Phase D — read unification.** Per property, once Phase A shows zero delta and Phase C shows no unresolved conflicts, flip `rate_resolution_mode` to `unified`. Portfolio and modify paths then use the shared resolver for that property only.
- **Phase E — daily ledger.** Start writing `rolos_booking_room_nights` on booking creation for `unified` properties, so per-night charged rates and overrides finally have a store. Existing bookings are left alone; reporting keeps deriving from totals when no night rows exist.

No backfill of prices, no rewriting of `amenities`, no destructive migration at any phase.

### 3.4 Risk assessment


| Risk                                                                                                                                  | Likelihood | Impact   | Mitigation                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| Guest sees a different price after resolver unification                                                                               | Medium     | Severe   | Shadow-compare writes to the audit table; old result served until parity proven per property                         |
| RU / channel push sends changed rates                                                                                                 | Low        | Severe   | Adapter-locked files untouched; push paths flip last, after audit parity                                             |
| The two `pms_rate_types` sync mechanisms overwrite new columns                                                                        | Medium     | Moderate | New columns are outside both mirrors' field lists; parity test asserts the mirror still round-trips                  |
| Hidden admin rate editor blocks a support fix                                                                                         | Medium     | Moderate | Read-only summary plus explicit break-glass override retained for admins                                             |
| Min/max-stay consolidation tightens or loosens a real restriction                                                                     | Medium     | Severe   | `rolos_stay_restrictions` is write-only until per-property conflicts are cleared; existing stores stay authoritative |
| Public REST API consumers break                                                                                                       | Low        | Severe   | Response shape frozen; only additive optional fields, version unchanged                                              |
| Uncovered season dates newly fall back to rack rate                                                                                   | Medium     | Moderate | Phase B surfaces gaps for human fill before any flag flip                                                            |
| Empty tables (`rate_prices`, `property_rates`, `booking_room_nights`, strategies, yield, pricing rules) hide an unnoticed expectation | Confirmed  | Moderate | Documented explicitly above; UI labelled honestly rather than silently retired                                       |


### 3.5 Rollback approach

- **Per-property instant rollback:** set `rate_resolution_mode` back to `legacy`. That single value returns every path to today's exact behaviour, because the legacy hierarchies are never deleted, only bypassed.
- **Global rollback:** the resolver keeps its current tier order behind the same flag, so reverting the flag default disables the unified path everywhere without a deploy of the adapters.
- **Schema rollback is unnecessary:** all schema work is additive and nullable, so leaving the new columns, views and tables in place is harmless if the initiative pauses.
- **UI rollback:** unhiding the Admin rate editor is one conditional; because it wrote the same tables all along, no data reconciliation is needed.
- **Evidence trail:** `rolos_rate_resolution_audit` retains the old and new resolved rate per day, so any post-flip dispute can be answered with the exact tier that produced the price.

### 3.6 Sequencing

1. Audit table, view, flag column, shadow logging — invisible to users.
2. Additive columns and the `pricing_model` normalisation trigger.
3. Resolver gains the relational season tier; parity run across all 89 properties.
4. Restriction consolidation into `rolos_stay_restrictions`; conflict report.
5. Per-property flag flips for portfolio and modify paths.
6. UI unification: hide the detailed rate editor in Admin for the 37 ROLOS properties; Rate Plans becomes the single surface.
7. Daily ledger writes on booking creation.
8. Only then decide about the revenue layer.

## 4. Open items needing your call

- `rolos_rate_strategies`, `rolos_yield_rules` and `rolos_pricing_rules` have full admin UIs, zero rows, and no engine consumer. Activate them in a later phase, or label them inactive in the UI now?
- `rolos_booking_room_nights` is empty and only the admin `ViewRatesDialog` touches it, so per-night rate overrides are not currently persisted by the booking flow. Confirm that Phase E should start writing it.
- PriceLabs currently targets the empty `rolos_rate_prices`/`rolos_rate_seasons`, which the main booking path ignores — accepted suggestions would not affect direct-booking prices. Repointing PriceLabs at the calendar seasons store would change live prices, so it is deliberately excluded until you confirm.
- `rolos_rate_plan_stop_sell` is adopted by only one property. Confirm closures should remain rate-plan-scoped rather than being expressed on the unified restriction table.