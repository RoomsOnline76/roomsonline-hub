# Revenue Reports: rolling seven-month window

## What changes

The printed review window becomes **the month just closed plus the next six** — seven months in total — and it rolls forward automatically each month-end.

- 31 August pack: August 2026 through February 2027.
- 30 September pack: September 2026 through March 2027 (August drops off, March joins).

The roll already follows the run's report month, so no month has to be picked by hand: setting the report month (or letting the as-of date resolve it) moves the whole window.

## Rules

- Default window length: 7 months (was 6). Applies to every property.
- A property with a custom window length in its report profile keeps that length; only the default changes.
- Months outside the window stay in the data as comparatives — nothing is deleted, so widening or narrowing later needs no re-upload.
- Months inside the window with no source data still print, as dashes.
- Existing finished runs are untouched. A run picks up the new window when it is reprocessed or its report/Excel/draft is regenerated.

## Where it shows up

Everything that reads the shared window helper follows automatically: the aggregated results table in the wizard (Stage F), the draft HTML report, the Excel workbook, the print pack, and TOBI's insights pass, which narrates exactly the window months.

## Technical section

- `supabase/functions/_shared/reportWindow.ts` and its client mirror `src/lib/reportWindow.ts`: `REPORT_WINDOW_MONTHS` 6 -> 7; update the doc comments ("review month plus five" -> "plus six") on `windowMonths`, `monthsInWindow`, `windowEndMonth`, `ReportWindowOptions`. No signature changes — `windowLength()` already falls back to the constant, so per-property overrides keep working.
- Comment/copy touch-ups only: `src/lib/reportProfile.ts`, `supabase/functions/_shared/reportProfile.ts` ("standard six" -> "standard seven"), `src/pages/reports/run-builder/StageParse.tsx` and `src/pages/reports/ReportsRunReview.tsx` helper text.
- Tests: `src/lib/__tests__/reportWindowProfile.test.ts` default-case expectation moves to seven months; the explicit `window_months: 8` profile case is unchanged.
- Redeploy the functions that bundle the shared helper: `nightsbridge-report-parser`, `opera-report-parser`, `protel-report-parser`, `report-prior-workbook-import`, `revenue-report-excel`, `revenue-report-draft`, `reports-xai-insights`.
- No migration, no schema change.

## Verification

Reprocess one current NightsBridge run (as-of 2026-09-02) and confirm the aggregated table, draft report and workbook all show 2026-08 through 2027-02, then confirm a run anchored on 2026-09 shows 2026-09 through 2027-03.
