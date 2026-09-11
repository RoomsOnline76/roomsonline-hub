# Cheetah Plains Daily Detailed Report — match the sample workbook

The workbook we build today is a single flat "Daily Detail" sheet with one row per day. The sample file provided works completely differently, and it is the shape the revenue team actually uses.

## What the sample workbook actually is

- One sheet per business day, named like `07Sep2026`, `04Sep2026`, `31Aug2026` — 387 day sheets so far, newest first.
- One extra summary sheet, `Week on Week`, kept as the first sheet.
- Each day sheet holds three financial-year blocks (previous, current, next). Every block lists its 12 months with quarter sub-totals and a TOTAL line, and these columns:
  month, BOB current day, BOB with deposit waive, occupancy current day, BOB previous day, occupancy previous day, variance current vs previous, budget, provisional current day, provisional previous day, provisional variance, variance to budget, same-time-last-year BOB and occupancy, last-year BOB and occupancy, variance to last year, provisional/confirmed split, and variance to budget.
- Under each block: combined revenue (BOB plus provisional) and its variance to budget.

## Why our figures did not match for 7 September

The day's uploaded set is 18 monthly House State exports (one per forward month), one Provisional Bookings workbook and the created/cancelled prints. That is exactly the input the sample needs: each House State export gives one month's on-the-books revenue and occupancy, and the provisional workbook gives that month's provisional figures.

Our current build ignored the month-per-file structure — it looked for one single day row and wrote day-level villa/F&B columns instead of the monthly on-the-books grid. So the numbers were both the wrong measure and mostly blank.

## What will change

1. **Monthly roll-up from the day's files.** Aggregate every House State export into per-month on-the-books revenue, nights, capacity and occupancy, and every provisional row into per-month provisional revenue. Months are grouped into the March–February financial years the sample uses.
2. **Day sheets.** Build the day's sheet in the sample's exact layout and name it in the sample's format (`07Sep2026`). Insert it directly after `Week on Week`, so the newest day is on top. Re-running the same day replaces that day's sheet instead of adding a duplicate.
3. **Carried columns.** Budget, same-time-last-year and last-year columns are not in the day's exports, so they carry from the most recent existing day sheet in the running workbook (the uploaded sample seeds them). Previous-day BOB and provisional columns read the previous day sheet's current-day figures. Any figure with no source stays blank, never zero.
4. **Week on Week.** Refresh the summary sheet from the current day's block after each build, keeping the existing layout.
5. **Running workbook.** The uploaded workbook in the wizard becomes the base to append to (this preserves the full 387-day history and all budget/last-year data). Without an upload we append to the stored copy from the previous run.
6. **One-page PDF.** The daily PDF now summarises the current financial year block — months, BOB, occupancy, budget, provisional and variance — plus the day's created and cancelled movements, rather than the day-level villa figures.
7. **Dashboard downloads.** The Cheetah Plains daily entries in the report history get both a workbook download and a report (PDF) download, using the run's stored spreadsheet and draft paths.

## Verification

Re-run the 7 September 2026 source set and compare the generated `07Sep2026` sheet against the sample sheet cell by cell for the current financial year block: month rows, BOB, occupancy, provisional and variance columns. Report every remaining difference and its cause.

## Technical notes

- `supabase/functions/_shared/cheetaplains/dailyDetailed.ts`: add a monthly aggregation model, financial-year block builder, sheet naming/insertion and same-day replacement; keep parsing pure.
- `supabase/functions/cheetaplains-daily-report/index.ts`: keep the one-workbook-per-batch CPU guard; persist the monthly roll-up per run day in `report_daily_days` so the workbook can be rebuilt without re-parsing.
- Workbook editing stays with ExcelJS on the stored base file; batch limits stay as they are to avoid the worker resource ceiling.
- `src/lib/reports/dashboardDownloads.ts` and the report history row gain the daily PDF download beside the existing workbook download.
