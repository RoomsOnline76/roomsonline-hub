# Rate Plans as an adapter boundary

Date: 2026-08-07 · Companions: `docs/verification/rate-plans-merge-gate.md`, `docs/rates-shim-inventory.md`, `docs/rates-backward-compatibility-contract.md`

**The rule, stated once:** Calendar = seasons only (when). Rate Plans = commercial rates
and unit links (what it costs).

## The boundary

Rate resolution is an adapter, not a feature. Every consumer calls one resolver and gets
back the same shape — `{ rate, tier, restrictions }` — regardless of which model produced
the number:

- `booking-orchestrator-api` (live quote / checkout)
- `booking-portfolio-api` (portfolio "from" price)
- `modify-booking`
- `pms-channel-sync`, `push-property-to-ru`, `ru-cert-portal` (ARI push)
- reporting, revenue and commission paths

The unified Rate Plans model was added **behind** that interface, not beside it. No
consumer learned a new call signature, so no consumer could regress on shape.

## Why nothing broke

1. **Additive schema only.** New tables and nullable/defaulted columns. Nothing dropped,
   renamed, re-typed, or made NOT NULL without a default.
2. **Per-property kill switch.** `properties.rate_resolution_mode` defaults to `legacy`
   and is read per request, so a rollback is one UPDATE and no deploy.
3. **Shadow mode.** The new engine computes and logs deltas to
   `rolos_rate_resolution_audit` without serving them. A wrong unified number is visible
   before it is ever quoted.
4. **Legacy mirror kept whole.** Saves through the new editor still write the legacy
   relational rows and calendar season buckets the old readers query.
5. **Single pure engine.** `supabase/functions/_shared/ratePricing.ts` holds the maths;
   UI preview, booking and ARI all call it, so the preview cannot drift from the quote.

## Tier precedence

```text
                         request (property, unit, date, occupancy)
                                         |
                    properties.rate_resolution_mode  ──── 'legacy' (default, all 104)
                                         |                        |
                                    'unified'                     |
                                         v                        v
   1. daily override (rolos_booking_room_nights / unit daily)   same tiers 1,2,5,6
   2. calendar season amount (Calendar-owned dates)
   3. plan season rate (rolos_rate_plan_season_rates: absolute | +amount | +percent)
   4. relational plan rate (rolos_rate_prices)
   5. rack / plan base_rate
   6. room type default_rate
                                         |
                     + unit differential, + stay restrictions cascade
                                         v
                        { rate, tier, restrictions }  ->  every consumer
```

Shadow mode runs the unified column for legacy properties and records the delta only.

## How it was proven

- Golden ARI snapshots built from real captured property fixtures (`scripts/capture-ari-fixtures.sql`).
- Pure-engine precedence and differential-stacking tests.
- Kill-switch tests: unknown / missing / error modes always fall back to `legacy`.
- Revenue and commission invariance tests (a rate change cannot move the split or base).
- `scripts/verify-rate-compat.sql` — 10 / 10 PASS.
- Audit-table drift review: 4 rows, all `booking-portfolio-api` "from" prices, all
  shadow-only, all explained.

## Rules for future work

- Add new pricing behaviour to the pure engine and a new tier — never to a consumer.
- Never let the Admin surface write rates for a ROL'OS property; it links out instead.
- Never introduce a second season store; the Calendar stays the only season configurator.
- Before removing any compatibility surface, satisfy the preconditions in
  `docs/rates-shim-inventory.md`.
