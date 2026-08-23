# Cheetah Plains: make the source pack and the historic report import

## What the last run actually did

The Cheetah Plains run created today (as-of 29 Jul 2026, source PROTEL) ended in `failed` with the message "Nationality_Report…: not a House State revenue grid". Checked against the run's own records:

- Three files were uploaded as period sources: the Company/Travel-Agent Production export, the Nationality report and the `raw creation` reservation list. None of them is a PROTEL House State day grid, which is the only thing the PROTEL parser turns into revenue rows — so the ledger came back empty and the parser failed the whole run.
- Nothing downstream ran: zero snapshot rows, zero special reports, no imported baseline.
- The manually-updated reservations workbook was filed as a **prior report** rather than a source, and the special-report builder deliberately skips prior-report files — so the travel-partner slide could never see it.
- The Production export was accepted but produced 0 rows and no market-code segments.
- The owner's-report PDF is fine: reading it now returns 12 months of on-the-books revenue, occupancy, budget and provisional per financial year for both FY2026/27 and FY2027/28, plus declined bookings, both years of travel partners and the nationality mix. It was simply never applied, because the run died before the import stage.

So there are two separate faults: Cheetah Plains has no House State export in its pack (its revenue grid lives in the owner's report), and the specialised files are mis-roled and never consumed.

## 1. A Cheetah Plains run must not fail for a missing House State export

- When the property is flagged for the Cheetah Plains report set, an empty House State ledger is no longer a failure. The run continues, and the missing day grid is recorded as a run event ("No House State export in this pack — revenue grid taken from the owner's report").
- Files recognised as Nationality / Production / Reservation list are reported as *consumed by the owner slides*, not as parse errors, and stop contributing to the run's error message.
- Any other source (NightsBridge, OPERA, standard PROTEL) keeps failing loudly on an empty ledger exactly as today.

## 2. Correct file roles for the pack

- The reservation lists (`raw creation…`, `updated manually reservations…`) and the Production export are stored as period sources with explicit roles, so both the revenue path and the owner slides can find them. A reservations workbook is never filed as a prior report again.
- Only the owner's-report PDF (and true consolidated workbooks) keeps the prior-report role.
- The upload step labels each Cheetah Plains file as it is recognised — nationality, production, reservations, owner's report — so a mis-drop is visible before parsing.

## 3. Build the revenue grid from the owner's report

- For Cheetah Plains the imported owner's-report figures become the run's revenue baseline: current on-the-books revenue, provisional, budget/target, occupancy, STLY and last-year actual per month, keyed on the March–February financial year.
- Room nights and ADR stay blank (the pack does not print them) rather than being invented; where the reservation list covers the period, villa nights are derived from it and marked as such.
- The six-month report window still follows the run's report month, so the snapshot, workbook and draft show the same months as every other property.

## 4. Run the owner slides automatically

- After parsing, the Cheetah Plains special reports and the 13-page owner pack are generated from whatever is present: nationality workbook, reservation lists and Production export first, falling back to the figures imported from the owner's report PDF.
- The Production export returning zero rows is investigated and fixed against the uploaded file so market codes actually split; if it genuinely carries no usable rows, that is stated on the slide instead of an empty table.
- Each slide records its source and any gaps (for example the chart-only multi-year partner trend pages) as warnings on the run.

## 5. Historic import surfaced in the wizard

- The prior-import stage becomes reachable on a run that has no House State grid, and for Cheetah Plains it is presented as a required step rather than an optional top-up, since it carries the revenue grid.
- The import preview shows what the PDF holds (months per financial year, declined rows, partner rows, nationality rows) with its tick boxes, and applying it writes the baseline the report then draws from.

## Technical notes

- `protel-report-parser`: read `property_report_settings.special_report_set`; when it is `cheetaplains`, treat a `kind: "other" | "production" | "nationality" | "reservations"` file as informational, and on an empty ledger build the snapshot from `report_runs.imported_baseline` instead of failing. Keep the existing failure path for every other property.
- `_shared/cheetaplains/*`: extend file recognition so reservation lists and the Production grid are matched by shape regardless of role; widen the file query beyond `file_role != 'prior_report'` to an explicit allow-list of source roles.
- `report-prior-workbook-import`: unchanged parser (verified correct against this PDF); on apply, persist the FY grids to `imported_baseline` and the three side tables to `report_special_reports`, then trigger snapshot rebuild.
- Wizard: `reportUpload.ts` role assignment for the Cheetah Plains file kinds, `StageParse.tsx` messaging for skipped specialised files, `StagePriorIngest.tsx` reachable and marked required for this property.
- Verify by re-processing run `ee2eefcd…`: expect a non-failed status, six-month snapshot from the imported grid, nationality + partners slides and the full owner pack present.

## Assumption to confirm

Cheetah Plains' pack contains no PROTEL House State export, so its revenue grid comes from the owner's report. If a House State export does exist for the property, it stays the preferred revenue source and the owner's report only fills gaps.
