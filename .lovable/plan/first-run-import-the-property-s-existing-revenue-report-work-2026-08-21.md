# First run: import the property's existing revenue report workbook

When a property has no earlier run in the platform, the previous-OTB, last-year-actual and historical columns come out empty and the first draft looks thin. This adds a step that asks for the property's current (last manually produced) consolidated revenue report Excel file and lifts the missing numbers out of it.

## 1. Ask for the file

- On the New Run wizard, when the selected property has no completed earlier run, show an extra optional step: "Previous revenue report workbook (recommended for a first run)" with a single-file drop zone (`.xlsx`, `.xls`).
- The same upload appears on the Run Review page as a card ("Prior report import") whenever the run has no comparison baseline, so an already-created first run can still be topped up.
- The file is stored in the existing `revenue-reports` bucket alongside the source files and recorded as a source file flagged as a prior-report import (not fed to the source parser).

## 2. Read what the workbook already knows

A new edge function reads the workbook and extracts, per sheet, whatever it can find:

- **OTB RR sheet** — the previous "OTB @ <date>" column (becomes previous-OTB), Last Year Actual, and where present Dinner, Room 0 and Comp RNs per month; the as-of date in the column heading is captured as the baseline date.
- **Fin Year sheet** — monthly actuals per calendar year (the year columns), used for last-year actuals and to grow the historical baseline.
- **Historical sheet** — the year x month revenue (and room-night, when present) grid, mapped straight onto the property's historical baseline.

Sheet and column detection is by heading text, not fixed cell addresses, so the NightsBridge and OPERA reference packs both parse. Legacy multi-tab workbooks (the PROTEL Grande Roche style, dozens of ad-hoc tabs with `#REF!` values) cannot be trusted: for those the function reports what it could and could not read and imports only the sheets it recognised, leaving the rest to the manual editors already in place.

## 3. Confirm before anything is written

- The function returns a preview: month-by-month table of the values found, which sheet each came from, and the detected baseline date.
- The reviewer picks what to apply with tick boxes: previous OTB, last-year actuals, additional inputs (dinner / Room 0 / comp nights), historical baseline.
- Applying writes: previous-OTB and last-year maps onto the run (as an imported baseline, so the automatic "previous run" logic no longer overwrites them), the additional inputs onto the run's manual inputs, and merged years into the property's historical baseline — never overwriting a value that already exists unless the reviewer chooses "replace".
- A run event is logged ("Prior report imported — 6 months previous OTB, 3 years historical") so the audit trail shows where the numbers came from.
- After applying, the existing Re-process action refreshes the snapshot, Excel pack and draft.

## 4. Where imported numbers show up

- The comparison-baseline card names the import ("Imported from 31.07.26 Torburnlea Homestead-Revenue Report.xlsx, as-of 31 Jul 2026") instead of saying this is the first run.
- Snapshot table, workbook and draft report keep their current columns — they simply have data now.
- The historical baseline editor marks imported months as coming from a prior workbook, next to the existing run/manual sources.

## Technical notes

- New shared parser `supabase/functions/_shared/priorReportWorkbook.ts` (heading-driven sheet/column detection, month-name normalisation, tolerant number parsing) plus a new `report-prior-workbook-import` edge function with `{ run_id, file_id, apply?, selections? }`.
- Migration: `report_source_files.file_role text not null default 'source'` (`'source' | 'prior_report'`), and `report_runs` gains `baseline_source text` plus `imported_baseline jsonb` holding the confirmed previous-OTB / last-year maps and their provenance.
- `nightsbridge-report-parser`, `opera-report-parser` and `protel-report-parser` skip files with `file_role = 'prior_report'`, and prefer `imported_baseline` over the previous-run lookup when no `previous_run_id` exists.
- Frontend: new `PriorReportImportCard.tsx`, a wizard step in `ReportsNewRun.tsx`, wiring in `ReportsRunReview.tsx`, `BaselineCard.tsx` copy, `HistoricalBaselineEditor.tsx` source label, and a `usePriorReportImport` hook. Strict types, semantic tokens only, existing money/percent formatters.
- Both the new function and the three parsers are redeployed after the change.
