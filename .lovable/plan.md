# Cheeta Plains: read the owner's report as a baseline import

The prior-report importer currently only understands consolidated Excel workbooks laid out as OTB / Fin Year / Historical sheets. The Cheeta Plains owner's report is a different animal: a designed PDF (with an Excel behind it) built on a March–February financial year, with quarter subtotal rows, two financial years side by side, and three non-revenue tables that feed the property's owner slides. Today it imports nothing.

This adds a second reader for that layout, keeps the existing workbook reader untouched for the other properties, and accepts either the PDF or the workbook behind it.

## 1. Accept the PDF as well as the workbook

- The prior-report upload accepts `.pdf` alongside `.xlsx` / `.xls`.
- On ingest the importer picks a reader from the file type: PDF goes through text/table extraction, spreadsheets keep using the current workbook reader.
- The PDF tables are read by position-aware text extraction (rows keyed by the `Mmm-YY` label in the first cell), not by fixed page numbers, so a re-styled deck still parses.

## 2. Read the monthly revenue grid

From each "REVENUE REPORT 20xx/20xx" table, per month:

| Column in report | Imported as |
|---|---|
| Confirmed BOB | current on-the-books revenue |
| Active Enquiries on the Books | provisional revenue (new) |
| Budget | monthly target |
| BOB STLY | same-time-last-year comparison |
| BOB LY Actual | last-year actual |
| Occupancy BOB / STLY / LY Actual | the three occupancy series |

Rules that make this report parse correctly:

- **Financial year Mar–Feb.** `Mar-26` … `Feb-27` map to real month keys spanning two calendar years, so `Jan-27` and `Feb-27` are not mis-stamped as 2026.
- **Quarter and TOTAL rows are subtotals, not months** — recognised by label (`Q1`–`Q4`, `TOTAL`) and dropped, then re-derived so a mismatch against the printed subtotal is reported as a warning rather than silently absorbed.
- **Two financial years in one file.** The FY containing the run's report month becomes the baseline; the following FY is kept as forward-year on-the-books data. Which FY went where is shown in the preview.
- Percentages arrive as `61%` and are stored as fractions; currency arrives as `R7 187 478`, `5,954,987` and `539.642` (a thousands separator typed as a full stop) — all three parse, and a value that breaks the month's scale is flagged instead of imported.
- Room nights are absent from this report; nights and ADR stay empty for Cheeta Plains rather than being invented.

## 3. Read the three owner-slide tables

- **Declined bookings** — month, value, agent/direct, reason, % of monthly revenue.
- **Top booking travel partners** — agency, room nights and revenue for both years, plus the multi-year inbound-partner and outbound-agent trend grids (2023/24 → 2027/28).
- **Bookings by nationality** — villa nights and revenue by country for both years.

These are stored against the run as special-report data, so the existing Cheeta Plains owner slides render from the imported figures when no fresh workbook was uploaded. Narrative pages (the written synopsis, key achievements, booking-trends commentary) are captured as commentary text the reviewer can keep, edit or discard — never printed automatically.

## 4. Preview and confirm, as today

The existing preview card gains rows for the new material: provisional revenue, budget, the three occupancy series, declined bookings, partner trends and nationality mix — each with its own tick box and a month/row count. Nothing is written until the reviewer applies, existing values are only overwritten when they choose "replace", and the run event names what came in ("Owner's report imported — FY2026/27 grid, 12 months; 9 declined bookings; 14 nationalities").

## Technical notes

- New shared reader `supabase/functions/_shared/priorOwnerReport.ts`: PDF text/table extraction, `Mmm-YY` + fiscal-year month keying, subtotal-row rejection, ZAR/percent tolerant parsing, and the three side-table readers. It returns the same `PriorReportExtract` shape as `priorReportWorkbook.ts` plus `provisionalRevenue`, `budgetByMonth`, `forwardYear`, `declinedBookings`, `partnerTrends`, `nationalityMix`.
- `report-prior-workbook-import/index.ts` becomes reader-agnostic: choose reader by extension, merge into the same preview/apply pipeline, and persist the new maps onto `report_runs.imported_baseline` and the side tables onto `report_special_reports` (keyed by run) — no schema change beyond widening the JSONB payloads.
- `report_source_files.file_role = 'prior_report'` still keeps the file away from the three source parsers; add `.pdf` to the accepted types in `PriorReportImportCard.tsx` and the storage upload guard.
- Client: `useReportPriorImport.ts` gains the new fields; `PriorReportImportCard.tsx` gains the extra tick boxes and counts. Strict types, semantic tokens, existing money/percent formatters.
- Verified against this exact PDF with a Bun test fixture (12 months per FY, subtotals rejected, Feb-27 keyed to 2027), then the function is redeployed.
