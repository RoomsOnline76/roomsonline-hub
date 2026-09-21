# Hotel status prints read correctly, plus a Word version of every report

## What is wrong today

I read the 17 September run and its uploaded files, and one of the hotel status prints itself.

1. **The 17 September run failed because its hotel status prints are PDFs.** That day the team exported "Hotel Status" as PDF (25 files). The daily report only knows how to read the hotel status grid from a spreadsheet; a PDF is only ever tried as a created/cancelled reservations print, so all 25 were skipped and the run ended with "No House State row for 2026-09-17 was found". On 18 September the same prints arrived as spreadsheets and the run succeeded — that is the inconsistency.

2. **Confirmed and provisional prints are being mixed.** Every hotel status print carries its own filter footer, and Cheetah Plains exports two sets per month:

   ```text
   State:   Confirmed
   State:   Optional, Tentative
   ```

   Both spreadsheets and PDFs carry this line, and nothing in the current reading looks at it. Two prints for the same month therefore collide, and the one kept is decided only by "which print carries figures" — so a month can end up showing provisional business as revenue on the books, or a confirmed month can be replaced by a provisional one. That is why the allocation looks wrong and moves between runs.

## What I will change

### 1. Read the filter footer and keep the two sets apart

- Every hotel status print — spreadsheet or PDF — is read for its `State:` line and labelled **confirmed** or **provisional** (Optional, Tentative, Option, Waitlist and the like). A print with no readable state is treated as confirmed and the run says so.
- Prints are de-duplicated within their own set only, per date, so a confirmed print can never be replaced by a provisional one and a re-print of the same set still supersedes the earlier one.
- **Revenue on the books, occupancy, ADR, month-to-date and the whole financial form come from the confirmed set only.**
- The provisional set prints as its own line on the day's page and in the month figures: provisional villa nights and value, clearly labelled and never added into revenue on the books. With no provisional print, that line prints a dash.

### 2. Read hotel status PDFs

The PDF print is the same grid as the spreadsheet, one month per file. It will be read row by row (date, free, occupied, arrivals, departures, accommodation, F&B, extras, total), reconciled against the print's own Total row exactly as the spreadsheet version is, and rejected with a clear note if it does not reconcile. So a day works whether the team exports spreadsheets, PDFs, or a mixture.

### 3. A Word download beside the PDF

A Word version of the finished report becomes available for the daily, monthly and bi-monthly reports, for every operating system we report on. It is the same page: same headings, tables, figures, graphs, colours, page size and page breaks — built from the same report content, so the two can never drift apart. The graphs are converted to pictures so they appear in Word exactly as printed.

The download sits next to the PDF button in the run builder's final step and in the dashboard's run history. Word may show a one-time "trust this file" prompt when opening it, as you chose.

### 4. Verification

- Rebuild the failed 17 September run from its own PDF prints and confirm: it completes, the day's villa state and revenue match the confirmed prints, and provisional business prints on its own line.
- Rebuild 18 September (spreadsheet prints) and confirm the confirmed/provisional split changes nothing that was already right, and that the months on the financial form no longer carry provisional value.
- Open the Word file for a daily and for a monthly report and compare it page by page against the PDF.

## Technical notes

- `supabase/functions/_shared/protel/houseState.ts`: parse the parameter footer into `{ reportingPeriod, state }`; add `houseStateState(grid)` returning `"confirmed" | "provisional"`; add `parseHouseStatePdfText()` that turns the print's text into the same `ProtelDay[]` + totals + state, reusing the existing reconciliation and warnings.
- `cheetaplains-daily-report/index.ts`: stored payload becomes `{ kind: "house_state"; state: "confirmed" | "provisional"; days }`; PDFs are tried as a hotel status print before the movement parser; `dayByDate` becomes two maps; `monthlyOnBooks` and `buildDailyFigures` receive the confirmed days, with provisional days passed separately.
- `_shared/cheetaplains/dailyDetailed.ts`: `DailyFigures` gains `provisional: { nights, revenue } | null` per day and per month; `dailyReportHtml.ts` prints it as a labelled row in the day panel and in the month block.
- `report_comparison_months` keeps taking `bob`/`occupancy` from confirmed figures only — no schema change.
- New `_shared/reportWordDoc.ts`: wraps finished report HTML in Word-compatible HTML (page size, margins and page breaks as Word section properties), rasterises inline SVG charts to PNG data URIs with `npm:@resvg/resvg-wasm`, returns the `.doc` bytes. Called by `cheetaplains-daily-report`, the monthly draft builder and `cheetaplains-special-reports`; the file is stored beside the report HTML and a new `word_report_path` column on `report_runs` holds it.
- Frontend: a "Word" button beside the report button in `StageDailyBuild.tsx`, `DownloadBar.tsx` and `RunHistoryList.tsx`, signing `word_report_path` through `dashboardDownloads.ts`.
