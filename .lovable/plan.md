# Rate Calculation Layer — pure nightly rate engine

Phase 3 of the unified Rate Plans work. Turns Rate Plan + Calendar season + unit differential + daily override into the final nightly rate, with zero I/O, so booking, ARI, channels and reporting all compute the same number.

## What exists today

`supabase/functions/_shared/rateResolution.ts` mixes two concerns: it loads data from the database (`createRateResolver`) and decides the price per night inside a closure (`resolveDays`). Because the decision logic lives inside an async loader, it cannot be unit tested and cannot be reused by anything that already has the data in hand.

Today's priority chain is: Calendar season rate → relational season (`rolos_rate_seasons` + `rolos_rate_prices`) → rack rate (`rolos_rate_plans.base_rate`) → unit daily rate. Consumers: `push-property-to-ru`, `pms-channel-sync`, `ru-cert-portal`, `booking-portfolio-api`, `modify-booking`.

Confirmed gaps: unit differentials (`rolos_rate_plan_room_types.differential_type/value`, added in Phase 2) are not applied anywhere; plan-level seasonal rates (`rolos_rate_plan_season_rates`) are not read; there is no per-date rate override store anywhere in the schema (`property_availability` carries availability, stop-sell and min/max stay, but no rate column), so the daily-override tier has an input but no persisted source yet.

## What gets built

### 1. New pure module `supabase/functions/_shared/ratePricing.ts`

No `supabase` client, no `fetch`, no `Date.now()`, no mutation of inputs. Everything it needs arrives as a plain `PricingInputs` object:

- calendar seasons (id, periods, min stay) — supplied by the Calendar, the only season owner
- season rates keyed as today (`amenities.season_rates`)
- rate plans per unit: base rate, pricing model, active flag, min/max stay, per-season amounts or multipliers
- unit differentials: `none` | `amount` | `percent` + value
- daily overrides: `{ [unitKey]: { [date]: { price, extra_guest_price?, min_stay?, max_stay? } } }`
- unit daily rates (last-resort fallback)

Exports:

- `resolveNightRate(inputs, unit, date): DayRate` — one night, one unit
- `resolveNightRates(inputs, unit, from, to): DayRate[]` — the window
- `resolveStayRules(inputs, unit, from, to): { min_stay, max_stay, closed_to_arrival, closed_to_departure }`

Priority per night (highest first):

```text
1. daily override        (Calendar-owned manual price for that exact date)
2. calendar season rate  (season_rates for the active Calendar season)
3. rate plan season rate (rolos_rate_plan_season_rates: absolute, or +amount / +percent on base)
4. relational season     (rolos_rate_seasons + rolos_rate_prices — legacy tier, unchanged)
5. rack rate             (rate plan base rate)
6. unit daily rate
```

Unit differentials apply to tiers 3, 4 and 5 (they modify a plan-derived amount), never to a daily override or an explicitly authored calendar season rate — those are already final. Inactive or soft-deleted rate plans and links are skipped entirely, so pricing falls through to the next tier. Missing season means the night simply falls through the chain; it is never priced at zero.

Min/max stay resolution order: daily override → rate plan season override → rate plan → Calendar season min stay → default 1 / unbounded.

### 2. `rateResolution.ts` keeps its exact public interface

`createRateResolver` keeps the same signature and returns the same `RateResolver` shape (`seasons`, `rackRates`, `relationalSeasonRates`, `unitDailyRates`, `closedDates`, `units`, `resolveDays`, `coverage`). Internally it becomes a loader: it fetches rows, additionally loads plan season rates and unit differentials from the Phase 2 tables, builds `PricingInputs`, and delegates `resolveDays` to `resolveNightRates`. `DayRate`, `RatePeriod`, `RateCoverage`, `compressToPeriods`, `normalizePriceWindow`, `findPeriodOverlaps` are untouched.

`RateSource` gains two members (`daily_override`, `plan_season`) and `RateCoverage` gains the matching counters. Additive only — existing consumers read `price` and switch on the sources they already know.

Because all Phase 2 additions are still empty in production, every consumer keeps getting byte-identical prices; the new tiers only activate once plan season rates or differentials are authored.

### 3. Test suite `supabase/functions/_shared/ratePricing.test.ts`

Deno tests in the style of the existing `ruPriceParsing.test.ts`, one case per required scenario:

1. Shared season, different unit rates (Jongensfontein) — one Calendar season across sibling units, each unit priced from its own plan link plus differential
2. Base rate only — no seasons at all, every night at the plan base rate
3. Season override — plan season rate beats the base rate, and calendar season rate beats the plan season rate
4. Daily manual override — a single date overrides everything, neighbouring dates unaffected
5. Min/max stay from the Rate Plan — plan values win over the Calendar season min stay
6. Inactive Rate Plan — skipped, falls through to unit daily rate
7. Missing season fallback — unpriced gap reported through coverage, never priced 0
8. Purity guard — inputs deep-frozen; the resolver must not throw or mutate

## Verification gate

Run before reporting anything complete:

- `deno test` across `supabase/functions/_shared/` — new suite plus the existing `ruPriceParsing` suite
- `deno check` on `rateResolution.ts`, `ratePricing.ts` and all five consumer functions
- `scripts/verify-rate-compat.sql` re-run — all 10 checks must still PASS
- A resolver parity spot-check against a live property (Jongensfontein and Tidal Pools) confirming the served prices are unchanged

Only after all four are green do the consumers get redeployed.

## Deliberately not in this step

- No schema change. The daily-override tier is implemented and tested, but nothing persists calendar daily rate overrides yet — the loader passes an empty map. Adding a Calendar-owned per-date rate store (an additive `rate_override` on `property_availability` plus the Calendar UI to edit it) is the next step, and the engine is already ready for it.
- No consumer is repointed to the new tiers; the kill switch stays `legacy` for all 104 properties.
