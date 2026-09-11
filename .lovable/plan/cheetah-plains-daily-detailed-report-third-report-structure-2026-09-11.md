# Cheetah Plains — Daily Detailed Report (third report structure)

Cheetah Plains already has two structures: the standard monthly revenue review and the bespoke owner pack. This adds a third, chosen as its own report type: a **Daily Detailed Report** that appends the day's figures to a running spreadsheet and prints a one-page daily PDF in the same house style as the monthly reports.

## What the user gets

**Starting a run**
- The New Report screen gains a report-type choice: *Revenue Review* (today's behaviour) or *Daily Detailed Report*. The daily type is offered for Cheetah Plains; the date field becomes the report day.
- Files are dropped in exactly as today — House State exports, the provisional bookings export, the created/voided PDFs, and optionally last version of the running workbook (`Daily Detailed Report 2026.xlsx`).

**Running workbook**
- ROL'OS keeps the latest running workbook per property. Each daily run appends that day's rows to it and stores the new version as the current one.
- If a copy is uploaded with the day's files, the uploaded copy is treated as the truth and replaces the stored one — so a manually edited workbook is never overwritten by a stale copy.
- Re-running the same day replaces that day's rows rather than duplicating them.

**Wizard stages for a daily run** (short — no prior-report ingest, no baseline, no slide organiser)
```text
1  Upload & parse      day's exports, running workbook optional
2  Review the day      figures read for the day, blanks flagged
3  Build & download    Daily workbook (.xlsx) + Daily report (PDF)
```
Both files are downloadable from the final step, side by side, and the run keeps them so they can be fetched again later.

**The daily PDF (one page, ROL'OS monthly styling)**
- Header: property name, "Daily Detailed Report", the day, ROL'OS/Sleep in Africa branding and the lodge logo bottom right.
- The day at a glance: villas occupied, guests in house, arrivals, departures, occupancy %, room revenue, ADR.
- Month to date against the same day's month total: revenue, nights, occupancy, ADR.
- Movement for the day: bookings created and bookings voided/cancelled (from the two PDFs), plus active enquiries value from the provisional export.
- Anything with no source for that day prints as a dash, never an invented figure.
- Saved filename follows the house convention, e.g. `Cheeta Plains - Daily Detailed Report - 7 Sep 2026 by RoomsOnline - Sleep in Africa.pdf`.

**First delivery**
Once built, the 7 September 2026 source set is run through it and both outputs are produced and filed to the Drive day folder alongside the existing packs.

## Technical section

- **Schema**: `report_runs.report_kind` (text, default `revenue_review`, values `revenue_review` | `daily_detailed`); `property_report_settings.daily_workbook_path` (storage path of the current running workbook) plus `daily_workbook_updated_at`. New table `report_daily_days` (run id, property id, report date, one jsonb of the day's measured figures, unique on property + date) so re-runs are idempotent and month-to-date is a query, not a re-parse. Migration follows the project order: create → GRANT (authenticated, service_role) → enable RLS → policies via `has_reports_access()`.
- **Parsing**: new `supabase/functions/cheetaplains-daily-report/index.ts` with a `_shared/cheetaplains/dailyDetailed.ts` helper — House State workbooks give occupancy/guests/villa state, the provisional export gives enquiries, the two PDFs give created/voided movement (text extracted with `unpdf`, as the OPERA parser already does). Reuses the existing House State reader from the Cheetah Plains pack code rather than a second parser.
- **Workbook append**: `exceljs` opens the stored (or uploaded) running workbook, locates the day sheet by header match, writes/replaces the day's row block, keeps existing formulas and formatting, and writes the result back to `revenue-reports/<property>/daily/Daily Detailed Report <year>.xlsx`, updating `property_report_settings`. The 11 MB workbook is read once, sheet-scoped, to stay inside the worker CPU budget — the same guard the Protel parser needed; if a full-workbook open still trips the limit, the append runs against the target sheet only via a streamed read.
- **PDF**: HTML built in `_shared/cheetaplains/dailyReportHtml.ts` on the same primitives as `revenueReportHtml.ts` (tokens, fonts, footer logo, `pdfDocumentTitle()` for the saved filename), printed client-side through the existing iframe print path.
- **Frontend**: report-kind selector in `ReportsNewRun.tsx`; `runBuildStages.ts` returns the three-stage daily sequence when `report_kind = 'daily_detailed'`; new `StageDailyReview.tsx` and a daily variant of the download bar; existing stage components reused for upload/parse. Hook `useDailyDetailedReport.ts` for build + download.
- **Verification**: run the 7 September 2026 set, confirm the appended day reconciles to the House State totals and the printed month-to-date matches the September figures already established for that run, then QA the PDF page as an image before filing to Drive.
