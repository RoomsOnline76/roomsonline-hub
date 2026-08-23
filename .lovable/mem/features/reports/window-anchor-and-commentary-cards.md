---
name: Report window anchor & commentary cards
description: report_month anchors the six-month revenue review window; every window month prints (dashes when no data) and gets a commentary card
type: feature
---

- `report_runs.report_month` (date) is the authoritative anchor for the six-month
  review window. Fallback when null: as-of day < 5 → previous month, else the
  as-of month. Helpers: `reportMonthAnchor` / `windowMonths` / `monthsInWindow`
  in `supabase/functions/_shared/reportWindow.ts` and its `src/lib` mirror — keep
  both in step.
- The report always prints all six window months. Months with no parsed data
  print as em-dashes, never as R0 or dropped rows. Stage F warns the reviewer
  which months have no source file and lets them change the report month.
- Revenue Commentary renders a calendar-style card per window month for every
  source (NightsBridge, OPERA, PROTEL), in chronological order across year
  boundaries; months without a line say so. Non-month lines print under
  "Overall commentary".
