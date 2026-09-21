# Retire the Excel workbook from Revenue Reports

Reports keep everything they need in the database and print the PDF from there. No spreadsheet is built, stored or offered anywhere.

## Part 1 — Cheetah Plains daily report (first)

Today the daily PDF's financial form (revenue on the books, occupancy, budget, same-time-last-year, last year, quarter and annual totals) is read back out of the running spreadsheet after the day's sheet is appended. That read-back is what keeps the spreadsheet alive, so it is replaced first.

1. **New store for the yearly figures.** A per-property, per-financial-year, per-month table holds budget, same-time-last-year, last year and their occupancies, plus revenue on the books and occupancy per month.
2. **One-time import.** You upload the consolidated workbook once on a small "Import comparison figures" panel in the reports settings for the property. Budget, same-time-last-year and last-year values are read into the table and the file is discarded — it is never written back. The panel shows which financial years and months were filled, and the values stay editable there afterwards.
3. **Each daily run** writes its own revenue on the books and occupancy per month straight into that table from the day's House State exports, then builds the financial form and its graphs from the table. Budget and last-year figures come from the imported seed and never change day to day. A month with no figure still prints a dash.
4. **Daily wizard** accepts only the day's source exports (House State, provisional bookings, movement prints). The spreadsheet upload slot, the "Daily workbook (.xlsx)" download and the "Download clean workbook sample" action are removed; the final step offers the PDF only.
5. **Verification:** rebuild the latest Cheetah Plains daily run and confirm the printed form matches today's output — budget, 27/8 comparison, quarter sub-totals and annual totals all populated, and no spreadsheet written.

## Part 2 — Monthly and bi-monthly reports, all sources

These PDFs are already built from the database snapshot, so nothing about the printed report changes.

1. Remove the Excel button from the run builder's download bar and the spreadsheet action from the dashboard's run history, for every source (NightsBridge, OPERA, PROTEL, RoomRaccoon).
2. Stop building and storing the workbook: retire the workbook builder function and the code that calls it, including the automated Drive runner's spreadsheet step.
3. Leave the existing stored paths on past runs untouched so history stays intact; they are simply no longer shown or refreshed.

## Technical notes

- New table `report_comparison_months` (property_id, fiscal_year_label, month, bob, occupancy, budget, stly, stly_occupancy, last_year, last_year_occupancy, source) with a unique key on property/month, RLS and grants matching the other report tables (staff-only).
- `_shared/cheetaplains/daySheetGrid.ts` is replaced by a database-backed grid builder feeding the same `DailyYearGrid` shape into `dailyReportHtml.ts`, so the PDF layout and its graphs are unchanged.
- `cheetaplains-daily-report`: drop `appendDaySheet`/`rawZipPatch`/`buildDailyWorkbook` usage, oversized-workbook recovery, versioning and promotion, and stop setting `excel_path` / `daily_workbook_path`.
- Deletions: `revenue-report-excel` function, `_shared/revenueReportWorkbook.ts` and its `workbookPart-*` files, `_shared/cheetaplains/dailyWorkbookSheet.ts`, `useReportExcel`, `downloadRunWorkbook`, Excel branches in `DownloadBar.tsx`, `StageDailyBuild.tsx`, `RunHistoryList.tsx`, `useDailyDetailedReport.ts`.
- A new small edge function reads the uploaded consolidated workbook once and writes the seed rows; it is only reachable from the settings panel.
