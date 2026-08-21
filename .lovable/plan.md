# Phase 3 – Consolidated Excel Generation

Note on current state: the database has only `report_runs` and `report_source_files`, and there is no parser, aggregator, `report_snapshots` or `property_report_settings` in the codebase — the approved Phase 2 work was never applied. Excel generation needs those numbers, so this plan builds the Phase 2 carry-over first, then Phase 3.

## Part A – Phase 2 carry-over (prerequisite)

- Tables `report_snapshots` and `property_report_settings` (room count, logo, brand colours, historical baseline), RLS via `has_reports_access()`, with GRANTs.
- Edge function `nightsbridge-report-parser`: reads the run's uploaded files from the `revenue-reports` bucket, parses the bookingsummary column set (header row located by column match, two title rows skipped), writes `parsed_ok` / `row_count` / `parse_errors` per file.
- Shared aggregator: arrival-month allocation, per month OTB revenue, room nights, ADR, occupancy, capacity days (rooms × days in month), source normalisation (Expedia group, "… | Roomsonline"/Own Booking → Own, Booking.com, LekkeSlaap, Other), Room 0 / Holding in Credit / Events kept in a separate non-sellable bucket.
- Previous ready run for the property becomes the "previous" baseline; last-year actuals read from `property_report_settings.historical_baseline`.
- Run review page: Process files action, per-file parse status, month-by-month results table. Property settings page: room count + branding form.

## Part B – Phase 3 workbook

A **Download Excel** action on a ready run produces a three-sheet workbook that mirrors the supplied Torburnlea reference file.

**Sheet 1 – OTB RR**
- Row 1 title: `<Property name> | <as-of date>`.
- Revenue block columns in reference order: month, `OTB @ <current date>`, `OTB @ <previous date>`, Variance, Last Year Actual, OTB vs LY, Dinner, Room 0, Comp RNs, Additional Revenue, Total Combined; TOTAL row with SUM formulas.
- Room Nights block and Occupancy block side by side (occupancy cells divide room nights by the month's capacity days), plus the "7 Rooms / 28 = 196 / 29 = 203 / 30 = 210 / 31 = 217" capacity legend derived from the configured room count.
- ADR block dividing the revenue rows by the room-night rows.
- Revenue Comparison Review panel (Revenue OTB vs LY and ADR OTB vs LY percentage columns).
- Notes footer: OTB / LY legend and the provisional-bookings note.

**Sheet 2 – Fin Year**
- Skeleton for the current and prior year: Jan–Dec revenue, room nights, occupancy and ADR blocks with variance and % variance formulas; value cells left open for later population, formulas already in place.

**Sheet 3 – Historical**
- Multi-year revenue / room nights / occupancy / ADR grid built from `property_report_settings.historical_baseline`, with year-over-year variance formulas and no rows when no history exists.

**Formulas, not values**: variance, totals, ADR, occupancy, % change and the LY comparisons are written as real Excel formulas referencing other cells, so the downloaded file stays editable. Only source measurements (OTB revenue, room nights, last-year actuals, manual dinner/Room 0/Comp RN inputs) are literal numbers.

**Formatting**: Arial throughout, `R#,##0` currency with dashes for zero, 0.0% occupancy and variance percentages, bold section headers, brand-primary header fills from property report settings, sensible column widths, frozen header rows, negative values in parentheses.

## Technical section

- New edge function `revenue-report-excel` (`{ run_id }`): auth-gated by `has_reports_access`, loads run + snapshot + property + report settings, builds the workbook with `npm:exceljs`, uploads to `revenue-reports/<run_id>/consolidated-<as_of>.xlsx` and returns a signed URL; records the path on the run (`excel_path` column added in Part A's migration).
- Layout constants and cell-address maths live in `supabase/functions/_shared/revenueReportWorkbook.ts` so the Phase 5 PDF/Canva work reuses the same row/column map.
- Manual inputs (Dinner, Room 0, Comp RNs) read from `report_additional_inputs` when present; created as part of Part A with an editable card on the run review page.
- Frontend: `useReportExcel.ts` hook plus a Download Excel button on `ReportsRunReview.tsx` with generating/ready states and error surfacing from the function response.
- Verification: generate the workbook for a run built from the four sample bookingsummary files at room count 7, then compare sheet structure, column order, formula strings and reconciled revenue / room nights / ADR / occupancy against `31.07.26_Torburnlea Homestead-Revenue Report.xlsx`, and confirm the file opens with zero formula errors.
