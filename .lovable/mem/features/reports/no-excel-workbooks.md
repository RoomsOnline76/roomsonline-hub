---
name: Revenue reports have no spreadsheet output
description: Reports are PDF-only; comparison figures live in report_comparison_months, seeded once from the consolidated workbook and never written back as zeros
type: feature
---

- No revenue-report template builds or offers a spreadsheet. `revenue-report-excel`, `_shared/revenueReportWorkbook.ts`, the `workbookPart-*` builders, `dailyWorkbookSheet.ts` and `daySheetGrid.ts` are retired; past runs keep their stored `excel_path` but it is never shown or refreshed.
- Cheetah Plains' daily financial form and graphs build from `report_comparison_months` (property + month unique): budget, STLY and last year with their occupancies are seeded once via `report-comparison-import` (panel in reporting settings; accepts an upload or a `storage_path`), and stay editable. Revenue on the books and occupancy are authored by each daily run.
- A month whose exports carry no figures is **left unchanged** — never written as zero, or a sold month would be wiped. A month with no figure prints a dash.
- Fiscal year is March–February; `fiscalYearLabel()` in `_shared/cheetaplains/comparisonGrid.ts` owns the `YYYY/YYYY` label, quarters and totals.
