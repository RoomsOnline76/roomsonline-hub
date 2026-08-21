# Phase 4 – Previous Snapshot, Last Year & Additional Inputs

Phase 4 closes the loop between runs: each new report leans on the previous one as its baseline, last-year actuals come from a per-property historical record, and the reviewer can supply the numbers NightsBridge does not export (dinner, Room 0, complimentary nights) plus the narrative notes.

No database changes are needed — `report_runs.previous_run_id`, `report_snapshots` (previous/last-year columns) and `report_additional_inputs` (dinner, Room 0, comp nights, min-stay/promotions/rate-override notes, free commentary) already exist.

## 1. Baseline visibility and override

- On the Run Review page, show a "Baseline" card naming the run currently used as "OTB @ previous date" (title + as-of date), or stating that this is the first run for the property.
- Let the reviewer change the baseline: a select listing that property's earlier completed runs, plus a "no baseline" option. Saving updates the run and prompts a re-process.
- The wizard keeps its current behaviour (auto-pick the most recent completed run for the property); the review page becomes the place to correct it.

## 2. Additional inputs and notes

- Extend the existing additional-inputs card so it also captures the three note fields (Minimum Stay, Promotions, Rate Overrides) and free commentary, all saved with the numbers in one action.
- Show a live per-month "Additional revenue" total (Dinner + Room 0) and a combined total (OTB + Additional) so the reviewer can sanity-check before processing.
- After saving, offer a one-click "Re-process" so the snapshot's `additional_revenue` and the workbook pick the values up immediately.
- Also surface these inputs in the New Run wizard as an optional step, pre-filled from the previous run's values, so a run can be created and processed in one pass.

## 3. Comparison columns in the review table

- Add previous-OTB, variance (value and %), and last-year actual columns to the snapshot table, with the same month rows and totals line.
- Colour variance with semantic tokens only (positive/negative), no hardcoded colours.

## 4. Historical baseline in property settings

Replace the raw JSON textarea with a usable editor:

- A year-by-month grid for revenue and room nights, add/remove years, occupancy and ADR derived from the stored room count.
- CSV/clipboard import: paste rows as `year,month,revenue,room_nights` (or upload a `.csv`), preview parsed rows, then merge or replace.
- CSV export of the current baseline for offline editing.
- Keep the JSON view available behind an "Advanced" disclosure for power edits.

## 5. Capture last-year actuals automatically

- When a run finishes processing, fold months that are fully in the past into `property_report_settings.historical_baseline` (revenue + room nights) unless a value already exists for that month, so the baseline grows without manual work.
- Existing baseline values are never overwritten silently; the settings grid shows which months came from runs versus manual import.

## Technical notes

- Parser (`nightsbridge-report-parser`): baseline back-fill of past months; keep reading `report_additional_inputs` for `additional_revenue`.
- Workbook (`revenue-report-excel` / `revenueReportWorkbook.ts`): pass the note fields through to the OTB RR sheet's notes block; formulas unchanged.
- Frontend: extend `ManualInputsCard`, `SnapshotTable`, `ReportsRunReview`, `ReportsNewRun`, `ReportsPropertySettings`; extend `useReportAdditionalInputs` and `usePropertyReportSettings`; add a small `historicalBaseline.ts` helper for CSV parse/serialise.
- Types stay strict (no `any`), money/percent formatting via the existing helpers, and both edge functions are redeployed after the change.
