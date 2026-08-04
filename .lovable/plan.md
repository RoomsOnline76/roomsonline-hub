# Step 4 — Pricing: guaranteed 365-day refresh + duplicate tests

## What I verified first

- `Push_PutPrices_RQ` is implemented (`rentalsunited-api`, actions `push_prices` / `push_prices_fsp`).
- Pricing is built from the shared rate hierarchy (`_shared/rateResolution.ts`: calendar season → unit daily rate → rack rate), the same resolver the booking engine uses, so channel and checkout prices agree.
- A refresh already runs on a schedule (`ru-ari-refresh` cron, every 6 hours — comfortably inside RU's 24-hour rule) and on booking events via `_shared/ruAriDelta.ts`.
- Post-push read-back verification exists (`verifyPrices`) with mismatch and missing-date reporting, plus currency conversion gating.

## Confirmed gaps to close

1. **No guaranteed full-window pricing.** `resolveDays` omits any date with no authored rate, and the push only aborts when *zero* days price. A property with a 60-day season and no rack rate silently publishes 60 priced days out of 366 — RU then blocks those nights from sale with no visible failure.
2. **No duplicate/overlap safety on the outbound payload.** `compressToPeriods` trusts that day rates are unique per date; duplicated dates (multi-unit lowest-price merge, FSP paths) can emit overlapping `<Season>` ranges, which RU accepts silently and resolves unpredictably.
3. **No pricing certification evidence.** Availability has a playground + duplicate-range test; pricing has neither, so there's no way to produce read-back evidence for the RU certification pack.

## Plan

### Phase 4a — Guaranteed 365-day price coverage
- Add a price-window normaliser alongside the availability one: dedupe by date (last authored wins), sort, and detect any unpriced date inside `[today, today+365]`.
- Extend `price_coverage` with `unpriced_dates` (first 50), `duplicate_dates_resolved`, and a plain-English summary.
- Enforce a coverage threshold: if any night in the window is unpriced, fail the price push with a clear `RU_PRICE_COVERAGE_INCOMPLETE` message naming the first missing dates and where to fix them (calendar season or rate-plan base rate). No dummy prices are ever sent — that rule stays.
- Log the outcome to `sync_logs` so the Coverage tab and cert console can read staleness and coverage together.

### Phase 4b — Duplicate / overlap tests
- Harden `compressToPeriods` against duplicate dates and assert produced periods are strictly non-overlapping and ascending before push.
- Add a `pricing_duplicate_test` action to `ru-cert-portal`: push the window twice, read prices back via `get_prices`, and assert the second push produces identical per-night prices with no duplicated or overlapping ranges.

### Phase 4c — Pricing playground (certification evidence)
- Add a `pricing_playground` action to `ru-cert-portal` that pushes prices for a chosen property/unit, reads them back, and returns per-night coverage, mismatches, source breakdown (season / unit daily / rack), and currency conversion detail.
- Add a "Pricing window" tab to the RU Certification Console mirroring the availability playground: push result, read-back coverage stats, duplicate-test result, and copyable evidence JSON for the RU pack.

### Phase 4d — Refresh guarantee surfacing
- Report last successful price push age per property in the Coverage tab (24-hour rule) and mark red when stale or when coverage is incomplete, with a deep link to the shortfall.

## Technical notes

- Files touched: `supabase/functions/push-property-to-ru/index.ts`, `supabase/functions/_shared/rateResolution.ts`, `supabase/functions/ru-cert-portal/index.ts`, `src/components/integrations/RuPricingPlayground.tsx` (new), `RuCertificationConsole.tsx`, `RuCoverageTab.tsx`.
- No schema changes; evidence rides on existing `sync_logs` / `ru_cert_runs`.
- No adapter-locked region is modified; the resolver stays the single source of truth shared with checkout.
