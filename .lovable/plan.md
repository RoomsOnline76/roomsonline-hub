# Grande Roche window months + commentary cards for every source

## 1. Why only Aug and Sept 2026 print

Two separate causes, both confirmed on the run (as-of 29 Jul 2026, PROTEL):

- **The window is anchored one month too early.** The window is derived as "the month before the as-of date, plus five", so this run's window is **Jun 2026 – Nov 2026**. Dec 2026 is therefore excluded by design, even if data existed.
- **Only two source files were ever uploaded** — `HouseState_2026-08-21T14-31-48.xlsx` (31 rows) and `...14-32-05.xlsx` (30 rows). Those are August and September only. There is no July, October, November or December House State extract in the run, so those months carry no OTB figures at all. The snapshot's other months come from the prior report workbook and all sit in past years.

### Fixes

- **Anchor the window on the month the report is for.** Add an explicit report month to the run (defaulting to the as-of date's own month — July for a 29 July run, and the month just closed when the as-of date falls in the first days of a month). It is shown and editable in the run header, so a reviewer can correct it. This run becomes **Jul 2026 – Dec 2026**.
- **Print every window month, even without data.** The revenue, room-nights, occupancy and ADR grids list all six window months; a month with no source extract shows an em dash rather than vanishing, so a gap is visible instead of silently reshaping the report. Totals ignore the empty months.
- **Tell the reviewer what is missing.** Stage F (Review aggregated results) gains a line naming the window months with no source data — "No source extract for Jul, Oct, Nov, Dec 2026" — with the reminder to go back to Stage A/B and upload them. The same note is logged to the run's activity trail.

After uploading the four missing House State exports and re-processing, the run prints Jul–Dec 2026 in full.

## 2. Revenue Commentary layout everywhere

The month-card commentary section already lives in the single shared report builder, so NightsBridge, OPERA and PROTEL all use it. Two changes make it behave as asked:

- **A card for every month presented**, not only months TOBI wrote a line for. Months without a line print an empty card under the month heading, keeping the calendar shape intact.
- **The grid runs to the last window month**, wrapping across the year boundary — a window ending in Jan or Feb 2027 prints those cards after Dec 2026 rather than stopping at December. Cards flow onto a continuation page in blocks of six; the reviewer's own notes and non-month lines stay as "Overall commentary" under the last block.

## Technical notes

- Migration: `report_runs.report_month date` (nullable). Backfill from `as_of_date` using the same rule as the new default so existing runs keep printing.
- `supabase/functions/_shared/reportWindow.ts` and its client mirror `src/lib/reportWindow.ts`: replace the as-of-derived anchor with `reportMonthAnchor(run)` — `report_month` when set, otherwise derived from `as_of_date` (same month, or previous month when the day-of-month is < 5). `windowStartMonth`/`windowEndMonth`/`monthsInWindow`/`trimToReportWindow` take the anchor instead of the raw date; the three parsers pass the run row through.
- `revenueReportHtml.ts`: build the month axis from the window rather than from `snapshot.months`, render missing months as `—`, and drop the `monthCommentary` presence filter on `monthCells`. `revenueReportWorkbook.ts` and `SnapshotTable` use the same axis so the three views agree.
- `StageReview.tsx` / `SnapshotTable`: derive and display the missing-month list; log it via `reportRunEvents`.
- Prior-workbook import currently lands ADR-shaped values as revenue for months such as 2015-03 and 2019-04 (outside every window, so invisible today). Add a plausibility guard in `priorReportWorkbook.ts` so only months within the property's real reporting history and revenue-scale values fold into the last-year baseline.
- No change to the six-month width (`REPORT_WINDOW_MONTHS = 6`).
