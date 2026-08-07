# Rates & Pricing: Current State Map + Safe Evolution Plan

Investigation only — no code in this step. Everything below was confirmed by reading the code and querying live data.

## 1. Current state map

### Where rate data physically lives (live row counts)

| Store | Rows today | Verdict |
|---|---|---|
| `properties.amenities.seasons` / `.season_rates` (JSONB) | 89 / 87 properties | **De facto source of truth for seasonal + nightly pricing** |
| `properties.amenities.pms_rate_types` (JSONB) | populated | Mirror of `rolos_rate_plans`, kept in sync by a DB trigger *and* by app code |
| `rolos_rate_plans` | 42 rows / 18 properties | Rate-plan identity + rack rate + `min_stay` |
| `rolos_rate_plan_room_types` | 65 rows / 10 plans | Unit-type linking |
| `rolos_rate_seasons` | 3 rows / 1 plan | Barely adopted |
| `rolos_rate_prices` | **0 rows** | Never populated — dead in practice |
| `rolos_rate_plan_stop_sell` | in use | Only store for date closures |
| `hostfully_room_types.daily_rate` / `.min_stay` / `.max_stay` | 109 rated units, 57 min_stay, 768 rows | Legacy per-unit mirror, last-resort fallback |
| `pms_rate_types_cache` | in use | Raw external-PMS rate mirror (Hostfully/HyperGuest/Cloudbeds) |
| `property_rates` | **0 rows** | Dead legacy table (only `sync-rates-availability` touches it) |
| `rolos_rate_strategies`, `rolos_yield_rules`, `rolos_pricing_rules` | UI CRUD only | **No pricing engine reads them today** |
| `rolos_booking_room_nights` | in use | Rate *actually charged*, post-booking; per-night overrides |
| `pricelabs_price_suggestions` | in use | Writes accepted suggestions into `rolos_rate_seasons`/`rolos_rate_prices` |

### Exact source of truth per concept

| Concept | Authoritative today | Competing stores |
|---|---|---|
| **Nightly / base rate** | `rolos_rate_plans.base_rate` (rack), consumed via `_shared/rateResolution.ts` | `hostfully_room_types.daily_rate`, `rolos_room_types.default_rate` (only `booking-portfolio-api`), `amenities.pms_rate_types[].baseRate` |
| **Seasonal rates** | `properties.amenities.seasons` + `.season_rates`, edited in the admin Calendar | `rolos_rate_seasons` + `rolos_rate_prices` (relational, empty) |
| **Min / max stay** | Fragmented — no single normaliser | `rolos_rate_plans.min_stay`, `rolos_rate_seasons.min_stay_override`, `hostfully_room_types.min_stay/max_stay`, `amenities.room_types[].minStayDays`, `amenities.seasons[].minStay` |
| **Unit-type linking** | `rolos_rate_plan_room_types.room_type_id` → `hostfully_room_types.id`, bridged by `hostfully_room_types.linked_rolos_id` → `rolos_room_types.id` | ad-hoc key matching by room name / amenity room id inside resolvers |
| **Rate plan identity** | `rolos_rate_plans.id` (+ `code`) | `amenities.pms_rate_types[]` JSONB mirror; `pms_rate_types_cache.external_rate_type_id` |

### Two confirmed architectural drifts

1. **Split season pricing.** `_shared/rateResolution.ts` (used by `booking-orchestrator-api`, embeds, showcase) reads *only* the JSONB calendar seasons. `booking-portfolio-api` reads *only* `rolos_rate_prices` → `rolos_rate_plans.base_rate` → `rolos_room_types.default_rate` → `hostfully_room_types.daily_rate`, never the JSONB. Because `rolos_rate_prices` is empty, the portfolio path today effectively serves flat rack rates while the single-property path serves calendar season rates.
2. **`pricing_model` is not normalised** — live values include `per_room`, `per_person`, `per-unit` and `UnitRate` in the same column.

### UI surfaces that write rate data

- `src/pages/PropertyForm.tsx` → `RateManagerTab` (+ `SeasonsCalendar`, `PoliciesTab`, `RatesOverviewPanel`): writes `amenities.seasons/season_rates/pms_rate_types`, `hostfully_room_types.daily_rate/min_stay/max_stay`, and mirror-upserts `rolos_rate_plans`.
- `src/pages/pms/PMSPropertySetup.tsx` embeds that **same** `PropertyForm` (`embedded` + `forceTabsOverride`) and defaults to the `rates` tab — so the "ROLOS rates" hub is the admin editor, not a separate implementation.
- `src/pages/pms/PMSRatePlans.tsx` — the only relational Rate Manager: `rolos_rate_plans`, `rolos_rate_plan_room_types`, `rolos_rate_seasons`, `rolos_rate_prices`.
- `src/pages/CalendarAccommodation.tsx` → `SeasonsCalendar` — seasons, into JSONB.
- Revenue surfaces: `RateStrategyDialog`, `RateStrategiesTable`, `PMSRevenue`, `PMSPriceLabs`, stop-sell dialogs.
- ROLOS-property identity is decided three different ways: `isRolosPms` in `src/lib/pmsUtils.ts`, a broader `isRolosPms` in `src/lib/pmsIdentity.ts`, and the `properties.is_rol_property` column.

### 3. Consumers that break if the rate shape changes without a migration path

**Locked adapters / booking-critical (highest risk):** `booking-orchestrator-api` (ARI + `NO_BOOKING_FROM_CACHE`), `_shared/rateResolution.ts`, `push-property-to-ru`, `pms-channel-sync`, `hostfully-api`, `beds24-api`, `nightsbridge-reservations-sync`, `ru-reservation-handler`, `hyperguest-api`.

**Booking / pricing readers:** `booking-portfolio-api`, `modify-booking`, `roomsonline-pms-api` (public REST v3.1 — external developers depend on its shape), `_shared/packages.ts`, `_shared/revenueStreams.ts`, `_shared/ruDiscounts.ts`, `ai-booking-concierge`, `help-assistant`.

**Financial / reporting:** `pms-financial`, `pms-night-audit` (accommodation vs F&B split reads `rolos_rate_plans.breakfast_*`), `rolos_booking_room_nights` overrides, `commissionResolver.ts` (percentage-only, safe), `ChargeCalculator.ts` (shares `breakfast_basis` semantics with `rolos_rate_plans`).

**Frontend:** `Booking.tsx`, `PropertyShowcase.tsx`, `EmbedProperty.tsx`, `EmbedPortfolio.tsx`, `RoomAvailabilityCalendar`, `ShowcaseAvailabilityCalendar`, `QuickBookDrawer`, `ViewRatesDialog`, `PMSDashboard`, `PMSRooms`, `PMSRevenue`, the WordPress plugin and `rol-sdk.js`.

**Sync mechanisms that would fight a schema change:** the DB trigger that bidirectionally syncs `rolos_rate_plans` ⇄ `amenities.pms_rate_types`, plus the app-level ROL-sync in `PropertyForm.tsx`, plus `sync-rolos-room-types` and `hydrate-pms-cache-to-rolos`.

## 4. Safest data-model evolution (additive only)

**Principle: no column is dropped, renamed or retyped; no existing reader is edited to change behaviour. Every new field is nullable with a default that reproduces today's result.**

1. **Do not move seasonal pricing.** The Calendar stays the only season configurator and `amenities.seasons/season_rates` stays its store. Rate Plans read seasons; they never own them.
2. **Retire by non-use, never by deletion.** `rolos_rate_prices` and `property_rates` are empty — stop writing to them (PriceLabs and `roomsonline-pms-api` become the last writers to be redirected) but leave tables and columns intact so existing reads keep returning empty exactly as they do now.
3. **Make `_shared/rateResolution.ts` the single resolver** and additively teach it the relational season tier, so its published order becomes: calendar season rate → `rolos_rate_seasons` override → rate-plan rack rate → unit daily rate. Since `rolos_rate_seasons` holds 3 rows on 1 plan, this changes output for effectively nothing while removing the drift. Then point `booking-portfolio-api` and `modify-booking` at the same resolver behind a per-property feature flag, defaulting off, with a shadow-compare log so any price delta is visible before the flag is flipped.
4. **New additive columns only** (nullable, no backfill required):
   - `rolos_rate_plans`: `source_of_truth` (`rolos` | `mirror` | `external_pms`), `pricing_model_normalised`, `min_stay_authority`. A trigger keeps `pricing_model_normalised` in step with the legacy free-text `pricing_model`; nothing reads the new column until a consumer opts in.
   - `rolos_rate_plan_room_types`: `link_source` (`explicit` | `name_match` | `amenity_id`) so ad-hoc key matching becomes recorded rather than re-derived.
5. **New table `rolos_rate_resolution_audit`** (property, date, unit, resolved rate, tier, resolver version) written by the resolver. This is the safety net: it proves old vs new resolution agree per property before any surface is switched.
6. **Keep both write mirrors running** during the whole initiative — the `rolos_rate_plans` ⇄ `amenities.pms_rate_types` trigger and `hostfully_room_types.daily_rate` stay populated so every legacy reader, including the public REST API and the WordPress plugin, is untouched.
7. **UI unification is presentation-only.** For properties where `is_rol_property` is true, the detailed rate editor is hidden from Admin Edit Property and the ROLOS Rate Plans surface becomes the single entry point — but it writes the *same* tables and JSONB paths the hidden editor wrote, so no data path changes. Admin keeps a read-only rates summary plus a break-glass override. Non-ROLOS properties keep the current editor unchanged.
8. **Unify the identity check** into one helper that consults `is_rol_property` first and `external_system` aliases second, with the two current helpers re-exporting it so no call site changes meaning.
9. **Adapter locks respected:** nothing in `.lovable/ADAPTER_LOCKS.md` is edited in this initiative without a separate explicit approval. The RU and channel push paths only change once the audit table shows parity.

**No destructive migration, no renames, no data backfill in this phase.**

## Sequencing

1. Resolver parity + audit table + shadow logging (invisible to users).
2. Additive columns and normalisation triggers.
3. Flip portfolio/modify paths to the shared resolver per property, behind the flag, after parity is proven.
4. UI unification: hide detailed rate editor in Admin for ROLOS properties; make Rate Plans the single surface.
5. Only then consider wiring `rolos_rate_strategies` / `yield_rules` / `pricing_rules` into the resolver — they are currently configured but unread, which is its own hidden expectation gap worth confirming with you.

## Open items needing your call

- `rolos_rate_strategies`, `rolos_yield_rules` and `rolos_pricing_rules` have full admin UIs but **no engine consumer**. Should step 5 activate them, or should they be labelled inactive in the UI?
- PriceLabs currently pushes accepted suggestions into the empty `rolos_rate_prices`/`rolos_rate_seasons` tables, which the main booking path ignores — so accepted suggestions do not affect direct-booking prices today. Redirecting PriceLabs to the calendar seasons store would change live prices, so it is deliberately excluded from this plan until you confirm.
