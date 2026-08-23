---
name: Owner's report as revenue source
description: Cheetah Plains-style runs with no PMS day grid build the revenue grid from the imported owner's-report PDF; prior-import file choice and special-report file roles
type: feature
---

- A run for a property with `property_report_settings.special_report_set` set (Cheetah Plains) must not fail when no protel House State export is uploaded. When `report_runs.imported_baseline.current_otb_revenue` exists, `aggregateFromImportedBaseline()` (`_shared/reportImportedBaseline.ts`) builds the snapshot from the owner's-report grid and a run event records it. Only when there is no imported baseline does the run fail, with a message pointing at the previous-report step.
- The owner's report prints revenue and occupancy, never room nights: nights are read back as `occupancy × capacity_days` so the totals row reconciles; ADR is left at 0 rather than invented.
- Prior-report import always prefers the newest `.pdf` on the run over spreadsheets uploaded at the same step, and refuses to write a baseline when the chosen file yielded no figures (reservation lists dropped there used to wipe a good baseline).
- `cheetaplains-special-reports` reads every non-PDF spreadsheet on the run regardless of `file_role` — nationality and reservation workbooks are often mis-roled as `prior_report`.
- Applying an owner's-report PDF import also refreshes the bespoke owner slides automatically.
