# Phase 5 — Length-of-stay rungs on the existing channel price push

Publish the length-of-stay ladder alongside the nightly seasons the channel already receives. A property whose plan has the LOS flag off keeps sending byte-identical pricing.

## Scope

Three changes only:

1. New pure helper `supabase/functions/_shared/ruLosPricing.ts` (+ `ruLosPricing.test.ts`).
2. Stamp the derived ladder onto the outbound price periods in `push-property-to-ru` (price path of `pushARI`).
3. Convert the nested ladder amounts in `convertPriceEntries` so they follow the same FX as the nightly.

Not touched: the XML builder (it already serialises the field), the full-stay matrix action, long-stay percent specials, availability push, calendar, rate-plan editor, guest checkout, modify.

## Helper

`losPricingForPeriod({ parentNightly, rungs, dateFrom, dateTo, calendarSeasonId, unitRolosId, rounding })` returns `{ nights, price }[]`:

- nothing unless `parentNightly > 0`.
- a rung only applies when its window covers the whole period; season-bound rungs must match the period's season id, dated rungs must contain both ends, a rung with neither never fires (mirrors the engine's window rule).
- unit scope: empty `room_type_id` is global, otherwise it must equal the unit's linked plan id.
- every matching threshold is published (the channel picks the rung at book time) — no "highest wins" here.
- pinned rung → the pinned nightly; otherwise `applyDerivation(parentNightly, type, value, rounding)`; dropped when the result is not a finite positive number.
- sorted by nights ascending, de-duplicated by nights.
- no per-guest overrides in this pass.
- `[]` when nothing matches, so callers omit the field entirely.

Also `losFingerprint(los)` — stable `nights:price` string — and `splitPeriodsByLos(...)`, a local splitter that breaks a compressed period wherever the ladder changes mid-range. `compressToPeriods` itself is left alone so the coverage audit and wizard keep today's grouping.

Tests: flags/empty rungs → `[]`; a 3-night −10% rung on a 1000 parent → one rung at the engine's own rounding; season mismatch → `[]`; a period only partially inside a dated window → `[]`; two rungs (3 and 7) both attach.

## Push path

In the price branch of `pushARI`, after `compressToPeriods` + `normalizePriceWindow`:

- read the unit's plan and rungs off the resolver (`resolver.ratePlans`, `resolver.pricingInputs.losRungs`, keyed by the unit's linked plan id);
- resolve a night's calendar season from `resolver.seasons` — note the season entries hold `periods: [{from,to}]`, so the lookup walks those periods rather than a single start/end pair;
- only when the plan's LOS flag is true, split the periods by ladder fingerprint and attach `los_pricing` to each; a period with an empty ladder keeps exactly today's shape;
- the building-level fallback push (no unit, several units) never attaches a ladder.

The nightly `<Price>` stays the parent price from `resolveDays`. The payload hash changes only for plans that actually gained a ladder, so unchanged flags-off pushes still skip.

## FX

`convertPriceEntries` (in the currency helper) gains a nested pass: each `los_pricing[].price` (and any future per-guest price) runs through the same `convertAmount` and effective rate as the nightly. Absent field → identical behaviour to today.

## Adapter locks

`buildPushPricesXml` in the channel API is a locked region and is not modified. In `push-property-to-ru` the locked regions are the account-resolution/phase gate and the inventory evidence writes; this change sits in the price push and leaves both untouched.

## Verification

Shared engine tests (`stayQuote`, `ratePricing`, `ratePricingGate`) plus the new helper test; empty diff for the frozen files (engine, stay-quote tests, checkout pages, modify path, the XML builder body, calendar); a dry-run push comparison for a flags-off property to confirm the payload and hash are unchanged.

Commit: `feat(ru): attach LOS rungs as PutPrices <LOSS>`.
