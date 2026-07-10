
## Problem

The portfolio embed (`/embed/portfolio/jongensfontein`) shows "From R1,000" on every property card. All four member properties are ROL'OS-native (`external_system = 'roomsonline'`), and their real rates live in `rolos_rate_plans` / `rolos_rate_prices` / `rolos_room_types`. Example: Dassiesingel has a rate plan with `base_rate = 600`, but the card still says R1,000 because the current pipeline reads from a stale mirror table.

Root cause in `supabase/functions/booking-portfolio-api/index.ts` (and the direct-DB fallback in `src/pages/EmbedPortfolio.tsx`):

```
starting_rate ← MIN(hostfully_room_types.daily_rate)  // stale mirror, uniform 1000
```

`hostfully_room_types` is used as a generic mirror even for non-Hostfully properties, and the client's `fetchLiveRatesBatch` explicitly skips `external_system in ('manual','roomsonline')`, so ROL'OS-native properties never get their real rate.

## Fix

Compute `starting_rate` from ROL'OS-native tables first, fall back to the mirror only when nothing is loaded natively.

### 1. `supabase/functions/booking-portfolio-api/index.ts`

Replace the single `hostfully_room_types` aggregation with a tiered resolver, in order:

1. `MIN(rolos_rate_prices.base_rate)` where `base_rate > 0`, joined via `rolos_rate_seasons.rate_plan_id → rolos_rate_plans` filtered to the property, active plans, and seasons overlapping today.
2. `MIN(rolos_rate_plans.base_rate)` for active plans of the property (fallback when no seasonal price rows exist).
3. `MIN(rolos_room_types.default_rate)` for active native room types (`default_rate > 0`).
4. Existing `MIN(hostfully_room_types.daily_rate)` (last resort for legacy/Hostfully-only rows).

Also derive `room_count` / `max_guests` from `rolos_room_types` when the property has native room types (currently comes only from `hostfully_room_types`, which inflates counts because mirror rows are duplicated — e.g. Fonteinhutte shows 9 mirror rows vs 15 native).

Batch the four supplementary queries once for all `propertyIds`, then merge in JS. Keep the response shape unchanged.

### 2. `src/pages/EmbedPortfolio.tsx` (direct-DB fallback path, lines ~247–272)

Mirror the same resolver so the client-side fallback matches the edge function output. Preserve the current shape written to `PortfolioProperty`.

### 3. Live-rates effect (lines ~326–344)

Leave the `fetchLiveRatesBatch` filter unchanged — it correctly skips ROL'OS-native properties, and their rates now come from step 1 above.

## Out of scope

- No changes to `hostfully_room_types` mirroring or to Hostfully/other PMS adapters.
- No change to the booking flow / orchestrator — this is a display-time "from price" only.
- No schema changes.

## Files

- `supabase/functions/booking-portfolio-api/index.ts` — swap rate/room aggregation for the tiered resolver.
- `src/pages/EmbedPortfolio.tsx` — same resolver in the direct-DB fallback branch.

## Validation

After deploy, expect Dassiesingel to show "From R600" and the other three to reflect their real native `base_rate` (or `default_rate` if no plan is priced yet). Verify via `booking-portfolio-api?portfolio=jongensfontein` response.
