# Revenue Mix in-product: panel, portfolio roll-up, and split-aware reporting

Surface the Accommodation / F&B / Other split everywhere an owner or manager reads revenue — not just as a toggle on the Revenue page.

## 1. One shared data source for the split

`src/hooks/useRevenueStreamTotals.ts` currently returns portfolio-wide totals only. Extend it (backwards compatible) to also return:

- per-property rows: property id, name, total, accommodation, F&B, other, room nights, accommodation ADR
- portfolio totals and the accommodation share
- `hasSplit` per property as well as overall

`PMSRevenue.tsx` keeps its own inline copy of this aggregation today; it moves over to the shared hook so the Revenue page, Reports and any future surface can never disagree.

## 2. Revenue Mix panel (new component)

A single reusable `RevenueMixPanel` used on both **ROL'OS → Revenue** and **ROL'OS → Reports → Analytics**:

```text
┌ Revenue mix ─────────────────── period · [Total | Accommodation] ┐
│ ███████████████████ Accom 79%  ████ F&B 18%  ▍Other 3%          │
│ R1 049 000            R241 600         R43 400                  │
├──────────────────────────────────────────────────────────────────┤
│ Property        Total    Accom      F&B    Other   Accom ADR     │
│ Fonteinhutte   R527 200  R412 500  R96 300 R18 400   R1 352      │
│ …                                                               │
│ PORTFOLIO      R1 334 000 …                                     │
└──────────────────────────────────────────────────────────────────┘
```

- Stacked share bar plus three stream figures.
- Per-property table below, sortable, with a portfolio total row. In single-property context the table collapses to that property's streams only.
- When no property in scope posts F&B, the panel shows a short "no split configured yet" state with a link to the rate plan breakfast setting instead of empty numbers.
- Colours from existing semantic tokens; no vendor names, ROL'OS/TOBI vocabulary only.

## 3. Split carried into Reports, analytics and trackers

**Reports → Analytics (`PMSReports.tsx`)**
- Revenue KPI card gains an accommodation / F&B sub-line, and ADR + RevPAR gain an accommodation-only variant driven by the same Total/Accommodation view switch as the Revenue page.
- Revenue & Bookings chart becomes stacked by stream when a split exists (single series otherwise).
- Revenue Mix panel added to the Analytics tab.
- CSV export gains `accommodation_revenue`, `fnb_revenue`, `other_revenue` and `accom_adr` columns, plus a per-property mix block.

**Revenue page (`PMSRevenue.tsx`)**
- Existing Total/Accommodation toggle stays and now drives the shared panel; the ad-hoc inline aggregation is removed.

**Trackers / dashboard**
- Portfolio and dashboard revenue counters get an accommodation-only reading alongside gross, so a manager comparing dashboard against Reports sees the same two numbers.

**Owner statement (`pms-financial`)**
- Statement totals gain the three-stream summary block so the emailed/downloaded statement matches the on-screen mix.

## Data policy

Everything reads posted folio transactions (`rolos_folio_transactions`, positive non-payment lines) — the same source already used for the toggle. Nothing is estimated or back-filled: properties with no F&B postings continue to report a single revenue figure exactly as they do today.

## Technical notes

- Shared hook returns `{ totals, byProperty[], accommodationShare, hasSplit }`; memoised, 60s stale time, accepts one property id or a portfolio array.
- New files: `src/components/pms/revenue/RevenueMixPanel.tsx`, `src/components/pms/revenue/RevenueMixTable.tsx`.
- No schema change required — `revenue_stream` already exists on folio transactions and room-night postings.
- Mobile: panel follows the `.rolos-mobile` density rules (stacked bar + condensed two-line property rows instead of a wide table).
- Charts use existing recharts setup with `hsl(var(--...))` tokens; no hardcoded colours.
