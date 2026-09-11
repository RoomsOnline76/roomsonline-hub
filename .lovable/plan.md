# Cheetah Plains daily report: figures page and year-on-year graphs

Today the daily PDF is a single summary page. It will keep that page and gain two
more, taken from the day sheet the run just wrote into the running spreadsheet.

## Page 1 — unchanged

The day, the month, movement and enquiries, exactly as it prints now.

## Page 2 — today's figures

The financial year, March through February, straight off the day's sheet:

- Revenue on the books, provisional business, budget and last year per month
- Nights, occupancy and rate per month
- The quarter subtotals and the year TOTAL line the sheet carries
- Months with no business still print, with dashes

## Page 3 — year on year

Four graphs, each month across the financial year, this year against the
comparison the sheet holds:

1. Revenue, this year vs last year
2. Occupancy, this year vs last year
3. Rate, this year vs last year
4. Revenue against budget

Bars for this year, a lighter bar or line for the comparison, brand pink and
charcoal, month labels underneath, a short legend, and a value axis. Each graph
prints as part of the page so it survives saving as PDF. Where a month has no
comparison figure the bar is simply absent rather than zero.

## What happens when a figure is missing

If the run has no base spreadsheet — so no day sheet to read — pages 2 and 3 are
left out and page 1 prints as before, with a line saying the figures page needs
the running spreadsheet uploaded with the day's exports.

## Technical notes

- Read-back helper in `supabase/functions/_shared/cheetaplains/dailyWorkbookSheet.ts`
  (or a sibling `daySheetRead.ts`): after `appendDaySheet` writes the day, parse the
  same sheet's `A1:AF93` block into a typed year grid — per month: on-the-books,
  provisional, budget, last year, nights, occupancy, rate — plus the quarter and
  TOTAL rows. Values only; formula results come from the cached values already in
  the workbook, and cells without a cached value are treated as missing.
- `cheetaplains-daily-report/index.ts` build step passes that grid into the HTML
  builder alongside `DailyFigures`, and stores nothing new in the database.
- `dailyReportHtml.ts` gains `yearGrid?: DailyYearGrid` in `DailyReportOptions`,
  a `.page` section for the figures table, and a third `.page` with four inline
  SVG charts (no chart library, no external requests — the PDF must print from
  the stored HTML). Shared axis/scale helpers live in the same file; if it passes
  ~400 lines the chart drawing moves to `dailyCharts.ts`.
- Charts use the existing brand tokens already threaded through
  `DailyReportBranding`; no new colours.
- Verification: rebuild the 7 September 2026 run, confirm three pages, check the
  page-2 totals against the day sheet in the spreadsheet, and confirm the graphs
  match those columns.
