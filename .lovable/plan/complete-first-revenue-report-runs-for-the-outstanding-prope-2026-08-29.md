# Complete first revenue-report runs for the outstanding properties

## Where things stand

Only four properties have ever produced a run: Cathedral Peak, Grand Roche Hotel,
Torburnlea Homestead and Aire Del Mar Guesthouse.

Properties configured for reporting with no run yet:

| Property | Source data on hand | Can run now |
|---|---|---|
| Cheeta Plains | PROTEL source + consolidated workbook + final report | Yes |
| Devonvale Golf & Wine Estate | Two printed comparison PDFs | Yes |
| Hotel Krige | Printed PDF + workbook | Yes |
| Les Chambres | RoomRaccoon workbook + printed PDF | Yes |
| Mziki Safari Lodge | No export on file | No — needs upload |

Two housekeeping issues found:

- The report-only records added for **Devonvale** and **Grande Roche** duplicate the
  existing **Devonvale Golf & Wine Estate** and **Grand Roche Hotel** records, and
  Grand Roche Hotel already carries a completed run. The duplicates must be folded
  into the originals so a property never has two report homes.
- The NightsBridge clients reconciled earlier — Jembisa, Kunjani Villas, Explorers
  Club, Ashbourne House, 55 on Main — have no report settings row and no export
  file on hand, so they cannot be run yet.

## What will be done

1. **Consolidate the duplicates.** Move the tuned report profile from the duplicate
   "Devonvale" record onto Devonvale Golf & Wine Estate, and from "Grande Roche"
   onto Grand Roche Hotel, then retire the two duplicate records so they no longer
   appear in report pickers.

2. **Run Cheeta Plains** (PROTEL). Ingest the raw creation export, the nationality
   and travel-partner reports and the consolidated baseline workbook, produce the
   grid plus the special reports, and check the printed totals against the Cheeta
   Plains final report.

3. **Run Devonvale Golf & Wine Estate** (printed-comparison source). Import the two
   printed PDFs as the baseline, build the six-month grid with the prior-year and
   STLY comparison columns, and reconcile against the printed report.

4. **Run Hotel Krige** (printed workbook with budget column). Import the workbook,
   render the budget plus 2025/2024 comparison columns, and reconcile against the
   printed report.

5. **Run Les Chambres** (RoomRaccoon). Import the workbook, render the target
   column, and reconcile against the printed report.

6. **Verify each run end to end** — Excel workbook and HTML draft both generated,
   totals matching the golden document, no missing months — and report the
   reconciliation result per property.

7. **Report what stays blocked**: Mziki Safari Lodge and the five NightsBridge
   clients, each with the exact export needed to unblock them.

## Technical notes

- Runs are created through the existing wizard pipeline: `report_runs` +
  `report_source_files`, parsed by `protel-report-parser` / `nightsbridge-report-parser`
  / `report-prior-workbook-import`, then rendered by `revenue-report-excel` and
  `revenue-report-draft`.
- Each property's quirks stay in `property_report_settings.report_profile`
  (`source_mode`, `year_columns`, `compare_years`, `stly_from_prior_workbook`,
  window and target keys) — no per-property branching in code.
- Duplicate retirement is a data change only (profile copy, then deactivate); no
  bookings or channel records are touched.
- Reconciliation is verified by comparing generated grid totals against the printed
  golden documents in `docs/reference/`, not by eyeballing the UI.
