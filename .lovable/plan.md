# Owner Showcase: F&B Revenue Split (one-pager)

A single, branded PDF an owner can be walked through in a meeting or emailed after it. No new app surface, no code changes to ROL'OS.

## The story it tells

1. **The problem** — one gross number hides what the owner actually earns from beds. Breakfast, dinners and bar spend sit inside "revenue", so ADR, commission checks and owner statements all read high.
2. **What ROL'OS now does** — every folio line is tagged Accommodation / F&B / Other at posting time, from the rate plan's breakfast configuration, so the split is automatic rather than a monthly reconstruction.
3. **What the owner sees** — Net accommodation revenue, F&B revenue, true accommodation ADR, and the same figures per property with a portfolio total on top.
4. **Why it matters to them** — cleaner commission and payout conversations, honest ADR benchmarking, F&B judged as its own business line, and no change to how guests book or pay.

## Layout (landscape one-pager, plus an optional second page)

```text
Page 1
 ┌───────────────────────────────────────────────┐
 │ kicker: ROL'OS REVENUE INTELLIGENCE           │
 │ TITLE: Know what the beds actually earn       │
 │ one-line standfirst                           │
 ├───────────────┬───────────────────────────────┤
 │ Before / After│  Portfolio roll-up table:     │
 │ single number │  property | total | accom |   │
 │ vs 3 streams  │  F&B | other | accom ADR      │
 │ (stacked bar) │  + PORTFOLIO TOTAL row        │
 ├───────────────┴───────────────────────────────┤
 │ 4 short benefit lines · footer + contact      │
 └───────────────────────────────────────────────┘

Page 2 (optional)
 "How it works in 3 steps" — configure breakfast on the rate
 plan → ROL'OS tags each posting → split flows into folios,
 invoices, Revenue page and owner reporting. Small screenshot-
 style panels, no fabricated UI.
```

## Numbers policy

Figures on the sheet are labelled **illustrative example** unless you confirm otherwise. If you want the sheet to carry real numbers for a named portfolio, say which portfolio and date range and I will pull the actual accommodation / F&B / other totals from posted folio transactions and mark the period on the page. Nothing is invented either way.

## Visual direction

Equatorial Luxe: pink `#E91E8C` for F&B and accents, charcoal `#1A1A2E`, ivory ground. Italiana for the headline, Instrument Sans for body, Geist Mono for the table figures. Restrained editorial register — this is a finance conversation, not a promo flyer.

## Technical notes

- Generated as a PDF with ReportLab into `/mnt/documents/`, delivered as a downloadable artifact.
- Every page rendered to images and visually inspected (overflow, table alignment, contrast) before delivery.
- Naming follows the vocabulary rules: ROL'OS, TOBI, "Channel Manager" — no vendor names.
- Wording for the mechanism is taken from the shipped module (rate-plan breakfast basis: per person per night / per room per night / per stay; streams: Accommodation, Food & Beverage, Other), so the sheet matches what the product does.

## Follow-on option (not in this deliverable)

If owners respond well, the same split can be surfaced to them in-product: a Revenue Mix panel with portfolio roll-up and a per-property breakdown, plus the split carried into the monthly owner statement PDF.
