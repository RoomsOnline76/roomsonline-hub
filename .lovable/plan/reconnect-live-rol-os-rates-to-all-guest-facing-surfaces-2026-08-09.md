# Reconnect live ROL'OS rates to all guest-facing surfaces

## What is actually wrong (verified)

The four Jongensfontein portfolio properties are all native ROL'OS properties. Each one has **one rate plan with a placeholder base rate of R1,000**, and their real prices live in the Rate Plans season rates table (12–39 rows per property). There are no relational season prices at all.

The shared rate resolver already prices them correctly — the audit table shows, for today's window:

| Property | Resolver (correct) | Served today |
| --- | --- | --- |
| Dassiesingel | R550 (plan season) | R1,000 |
| Fonteinhutte | R610 (calendar season) | R1,000 |
| Tidal Pools | R700 (calendar season) | R1,000 |
| SEESIG | R900 (plan season) | R1,000 |

Two separate breaks cause this:

1. **The resolver is switched off everywhere.** `rate_resolution_mode` is `legacy` for all 16 trading properties, so the portfolio listing serves a legacy "cheapest number in the database" scan, which only ever sees the R1,000 placeholder base rate.
2. **No guest-facing path reads the Rate Plans season rates.** The booking orchestrator's native ROL'OS pricing path reads only the rate plan base rate, the legacy calendar `season_rates` grid and stop-sells — it never reads `rolos_rate_plan_season_rates`. So even the checkout, room grids and embeds miss rates authored in ROL'OS Rate Plans.
3. **The client live-rate helper skips ROL'OS properties by design.** `fetchLiveRates` returns empty immediately when a property's external system is empty, `manual` or `roomsonline`, so portfolio cards never even attempt a live refresh for native properties and stay on the listing fallback number.

## What to build

**1. Make the orchestrator price native properties with the shared resolver**
Replace the ad-hoc rate maths in the orchestrator's ROL'OS path with `createRateResolver(..., { audience: "direct" })` for per-night prices, while keeping the existing availability, stop-sell, occupancy/per-person and embed-rate-override behaviour. This single change repairs the property embed, checkout, room grids, availability calendars, TOBI quotes and the journey editor, since they all call the orchestrator.

**2. Serve the resolver's starting rate on the portfolio listing**
In the portfolio API, use the resolver result as the served `starting_rate` for every property instead of gating it behind `rate_resolution_mode`, keeping the legacy figure only as the drift comparison written to the audit table (and as an emergency fallback when the resolver prices nothing).

**3. Let native properties refresh live rates in the browser**
Remove the early "native = no live rates" bail-out in the live-rate helper so ROL'OS properties resolve through the orchestrator like PMS-backed ones. Keep the 5-minute client cache and per-property failure isolation.

**4. Remove the duplicate client-side rate scan in the portfolio embed**
The portfolio embed has its own copy of the legacy min-rate scan used when the API call fails. It only reproduces the wrong R1,000 number, so it should fall back to the API/live resolver values instead of scanning rate tables in the browser.

**5. Widget API starting rate**
The widget room feed exposes only the legacy unit daily rate. Give it the resolver's per-night price for the requested window so embeds and third-party widgets quote the same number as checkout.

**6. Keep a kill switch, flip the default**
`rate_resolution_mode` stays as a per-property escape hatch, but its meaning inverts: resolver by default, `legacy` only when explicitly set. No data migration is needed for the fix itself.

## Verification

After the change the portfolio embed link must show From R550 (Dassiesingel), R610 (Fonteinhutte), R700 (Tidal Pools) and R900 (SEESIG) — matching the audit table — and opening each property must carry the same nightly prices into the date grid and checkout totals. Re-check the audit table afterwards to confirm resolver and served values agree, then spot-check one PMS-backed property (Woodlands Close / HyperGuest sample) to confirm nothing regressed on the PMS path.

## Technical notes

- Files: `supabase/functions/booking-orchestrator-api/index.ts` (`resolveRolosRates`), `supabase/functions/booking-portfolio-api/index.ts`, `supabase/functions/booking-widget-api/index.ts`, `src/lib/pmsLiveAvailability.ts`, `src/pages/EmbedPortfolio.tsx`.
- The adapter/PMS branches of the orchestrator are untouched; only the native ROL'OS branch changes.
- Resolver tier order is unchanged: daily override → plan season rate → calendar season → relational season → rack rate → unit daily rate.
- Parity logging via `rolos_rate_resolution_audit` is retained so drift stays observable.
