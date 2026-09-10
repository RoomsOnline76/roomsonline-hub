---
name: Cheetah Plains owner pack built from each run
description: The bespoke Cheetah Plains pack is generated automatically from the run's own snapshot, provisional export and carried comparison columns — never toggled, never copied from last month's PDF
type: feature
---

- Every Cheetah Plains run prints the bespoke owner pack **in addition to** the regular report. There is no toggle: `protel-report-parser` calls `cheetaplains-special-reports` with the service role right after the snapshot is written, and the run page only offers a Rebuild.
- Figures come from the run: confirmed BOB and occupancy from `report_snapshots`, Active Enquiries from the provisional-bookings export (`_shared/cheetaplains/provisional.ts`, revenue spread per night across months). With no provisional file the column prints **blank**, not zero, plus a run note.
- Budget, BOB STLY, LY actual and the comparison occupancy columns are carried by `_shared/cheetaplains/carriedPack.ts` — newest earlier pack's `revenue_grid_*` slide rows first, then `report_runs.imported_baseline`. Nothing is derived; an uncarried cell stays blank and the shortfall is warned.
- Grid slides must keep `rows` (with each row's `month`) in their payload — that is what the next run reads its comparison columns back from.
- The two written pages (business-on-the-books analysis, distribution & reservations update) are drafted by TOBI from the grid digest only, with last month's pages as the voice reference and the fallback when the model is unavailable. Fiscal year is March–February.
- Nationality and travel-partner workbooks uploaded to the run always beat the carried tables. When a run has no snapshot yet, only those two workbook-driven slides are produced.
