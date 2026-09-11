# Cheetah Plains: full report history on the dashboard

Today the Revenue Reports dashboard shows one line per report run with a Quickview button. For Cheetah Plains there are three different report products (monthly review, owner pack, daily detailed), and the history line does not say which one a run is, nor does it offer the daily Excel file.

## What changes

1. **Every run says what it is.** Each history line gets a small label: "Monthly", "Owner pack" or "Daily". A run that produced both the monthly report and the owner pack shows both labels.
2. **Cheetah Plains history groups by type.** Expanding the Cheetah Plains row shows its runs grouped under "Monthly reviews", "Owner packs" and "Daily reports", newest first, each with its date. Other properties keep the existing single list.
3. **Actions per line, matched to what exists.**
   - Monthly / daily: Quickview (opens the report in the dashboard), Open run builder (review/edit).
   - Owner pack present: an extra "Owner pack" action that opens the merged pack for viewing and saving as PDF, reusing the existing pack merge used inside the run builder.
   - Daily runs: a "Excel" download button that saves the running spreadsheet, plus the report download, both straight from the dashboard with no rebuild.
4. **Nothing to download is never a live button.** Buttons disable with a tooltip when that file was never generated for the run.

## Technical notes

- `useReportPortfolio`: add `report_kind`, `excel_path`, and a `report_special_reports(count)` aggregate to `RUN_SELECT`; expose `reportKind`, `hasExcel`, `specialReportCount` on `PortfolioRun`. Reuse `asReportKind` / `REPORT_KIND_LABEL` from `useReportRuns`.
- `RunHistoryList.tsx`: render the type label chip; add the Excel download (signed URL from the `revenue-reports` bucket for `excel_path`, `downloadFile` from `@/lib/reportDraftHtml`) and the owner-pack action.
- Owner pack view: reuse `useSpecialReports` (`open`/`readHtml` + `mergeOwnerPackPages`, `packFileName`) — new dialog-level hook call keyed by run id, no new edge function, no new storage layout.
- `PropertyReportRow.tsx`: group history by report type when the property is the Cheetah Plains reporting client (detect via the run set containing daily/owner-pack runs, keeping the flat list for all other properties).
- Frontend only: no schema change, no edge function change.

## Verification

- Cheetah Plains row lists the August monthly run, its owner pack and the 7 September daily run under their own headings.
- Daily run's `.xlsx` and report both download from the dashboard.
- A second property's history renders unchanged.
