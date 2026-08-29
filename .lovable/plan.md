# Revenue Reports dashboard — portfolio management workspace

Today the dashboard is two flat lists: "Recent runs" (every run appended forever) and "Properties with reports". Nothing shows where a property stands in its reporting cycle, and the only way into a report is the run builder.

The new dashboard treats the property — not the run — as the unit of management, with each property's run history collapsed underneath it.

## What the dashboard becomes

**1. Cycle header (KPI strip)**
Five compact tiles for the current reporting cycle: properties reporting, reports published (status ready), in progress (draft/processing), needs attention (failed / parse issues), and overdue (no run for the property's cadence window — monthly or bi-monthly, from the run's cadence field).
Clicking a tile filters the list below.

**2. Portfolio list — one row per property**
Each row shows: logo, property name, city, room count, source badge, cadence, the latest run (report month, as-of date, status pill) and a sparkline-free "run count" chip. Reporting-only clients keep their badge.
Row actions: Quickview report, Open run builder, New run for next period, Settings.
Expanding a row reveals that property's run history — newest first, each with month, as-of date, status and its own Quickview / Open links. Superseded runs stay reachable but stop competing for space.

**3. Controls**
Search (property name), status filter, source filter, reporting-month filter, sort (needs attention → last reported → name), and a view toggle:
- **Portfolio** (default): the property rows above.
- **Timeline**: runs grouped by reporting month, so a whole cycle can be swept in one pass.

**4. Hover summary popout**
Hovering (or focusing, for keyboard) any report entry opens a popover:
- Page 2 "TOBI Assessment" when the run has one — headline, primer excerpt, and up to three highlights / warnings / red flags with their existing severity styling.
- Otherwise the run's **Revenue Commentary** — the reviewer-final narrative (falling back to the generated narrative), trimmed to a readable excerpt.
- Otherwise a plain "No commentary captured yet" line with a link into the TOBI stage.
Header of the popover always names the property, report month and as-of date.

**5. Quickview — the final report, full**
A near-fullscreen dialog that renders the run's generated report exactly as printed, with Save as PDF and "Open in full page" (the existing `/runs/:id/draft` view). When a run has no generated draft yet, the dialog says so and links to the build stage.

## Technical notes

- `src/hooks/useReportPortfolio.ts` (new): joins the existing `useReportProperties` set with all `report_runs` per property, plus a light `report_insights` read (`page2`, `narrative_final`, `narrative`) and `report_runs.draft_report_path` / `page2_enabled`, and derives cycle status + overdue flags. Replaces the dashboard's use of `useReportRuns`; the hook itself stays for the run builder.
- `src/lib/reports/reportHtmlSource.ts` (new): the signed-URL → HTML → blob-URL load currently inlined in `ReportsDraftView.tsx`, extracted so the Quickview dialog and the full-page view share one implementation. `ReportsDraftView` is refactored onto it (no behaviour change).
- `src/lib/reports/runSummaryPreview.ts` (new): picks Page 2 vs Revenue Commentary and trims excerpts, reusing `parsePage2` and `page2HasContent` from `src/lib/reports/page2.ts`.
- New components under `src/components/reports/dashboard/`: `CycleStatsBar.tsx`, `PortfolioFilters.tsx`, `PropertyReportRow.tsx`, `RunHistoryList.tsx`, `ReportHoverSummary.tsx`, `ReportQuickViewDialog.tsx`, `TimelineView.tsx`.
- `src/pages/reports/ReportsDashboard.tsx` is rebuilt as composition only; `ReportPropertyCard.tsx` stays for the settings page.
- Presentation only — no schema changes, no edge function changes, no parser or builder changes. Existing semantic tokens and shadcn primitives (Popover, Dialog, Collapsible, ToggleGroup, Badge) throughout; no hardcoded colour utilities.
- Filters and the view toggle persist per user in `sessionStorage` so returning to the dashboard keeps the working set.
