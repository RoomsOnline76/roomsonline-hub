# Count only trading properties

Today the counts use `is_active`, which 72 of 104 property rows carry — including 52 rows whose lifecycle stage is still `inactive` and 37 still pre-contract. That is why the Admin Dashboard shows "72 / 104" and the Portfolio Demand Forecast reports 33 PMS properties and 0.6% occupancy: the denominator is stale inventory that is not trading.

## What changes

1. **New explicit staff-controlled flag** on each property: *Trading* (countable). Nothing is derived from lifecycle or readiness — a staff member turns it on when the property is genuinely live and blocker-free.
2. **Sandbox/test rows are excluded from every count and metric.** They stay fully usable in admin lists, editors, integration pages and certification tooling — they just never enter a number.
3. **Every count, KPI, occupancy, forecast and acquisition metric** is rebuilt on the trading set.
4. **Stale inventory stays visible only in the pipeline view** (Property Acquisition Tracker), which keeps counting all onboarding stages by design.

## Seeded trading set

Turned on for the properties you named:

- Fonteinhutte Self-Catering Chalets, Dassiesingel Self-catering Units, SEESIG Self Catering CHALETS, Tidal Pools Self Catering Apartments (Jongensfontein.com)
- Latter Days - STILBAAI

Turned on but flagged sandbox, so they work everywhere yet never count:

- [SANDBOX] Woodlands Close, [SANDBOX] Victorian House (Sample), [SANDBOX] HOTELBEDS SPAIN - PRUEBAS, HyperGuest

Everything else starts as stale inventory.

## Where the flag is set

- Property editor → General: a "Trading (include in counts and metrics)" switch next to the existing active state, staff-only (admin / dev / fearless_leader), with a one-line explanation that turning it off removes the property from dashboards but keeps it fully editable.
- Admin property list: a filter chip for Trading / Stale, and a badge on stale rows.

## Pages and metrics reworked

| Surface | Today | After |
| --- | --- | --- |
| Admin Dashboard – Active Properties | `is_active` count vs all rows | trading count vs all rows, subtitle "trading now" |
| Admin Dashboard – integration banner | "104 properties registered" mismatch warning | compares against trading count, so the false alarm goes away |
| Dashboard (owner/admin) – Total Properties, occupancy, ADR, RevPAR | all relevant properties | trading only, so occupancy denominators are real |
| Portfolio Demand Forecast | every `rolos_rooms` row | rooms belonging to trading properties only |
| Property Acquisition Tracker | all active + inactive | keeps the full pipeline (unchanged), plus a "trading" line so the two views reconcile |
| Property Overview – Active Properties | local `is_active` filter | trading filter |
| Dev Overview / System Overview adapter "live properties" | property count per PMS | trading count per PMS |
| Channel cost monitor | `state === "live"` | intersect with trading, so forecast spend stops counting parked units |
| ROL Pulse revenue / payout property counts | properties with bookings in period | unchanged in substance, but stale rows can no longer appear |
| Dashboard insights / revenue-pulse insights prompts | totalProperties | trading total, so the narrative stops quoting inflated inventory |

## Technical notes

- Migration on `properties`: add `is_trading boolean not null default false` and `is_sandbox boolean not null default false`, plus a partial index on `is_trading` for the count queries. Backfill the two lists above (sandbox detected from the `[SANDBOX]` name prefix and the HyperGuest test row).
- New `src/lib/propertyScope.ts` exporting the canonical predicate and query helper (`applyTradingScope(query)` → `.eq('is_trading', true).eq('is_sandbox', false)`), so no page re-invents the rule. The existing `is_active: true` rule stays for property selectors; trading is an additional metric-only gate.
- Same helper mirrored in `supabase/functions/_shared/` for the insight/report functions that count properties.
- RLS unchanged; the flags are readable wherever the property row already is, and writable only by staff policies that already govern property edits.
- No booking, billing or payout maths changes — only which properties feed the counts.
