# Sheet 1 (OTB RR): use everything the prior workbook already knows

Comparing the property's own report (`31.07.26_Torburnlea_Homestead-Revenue_Report.xlsx`) with ours (`consolidated-2026-08-14.xlsx`) shows the numbers were available but the import used the wrong ones, or dropped them. Verified findings and the fix, Sheet 1 first.

## What went wrong

1. **Wrong comparison column.** The uploaded workbook holds two columns: `OTB @ 14 Aug 2026` (its current) and `OTB @ 31 Jul 2026` (its previous). The importer always takes the newest OTB column, so our "previous OTB" is 14 Aug — the same date as our own run — instead of 31 Jul. Jul shows 362,937 as "previous" where it should be 360,742, and every Variance is meaningless.
2. **Header says `OTB @ n/a`.** The as-of date read from the workbook is never stored on the run, so the previous-OTB heading has no date at all.
3. **Two months missing.** Ours covers Jul–Nov 26; theirs covers Jul 26 – Jan 27. Dec 26 and Jan 27 exist in the imported baseline, but the baseline can only fill months already found in the uploaded source files, so they were discarded (and partly landed in the Historical sheet as bogus 2026/2027 actuals).
4. **Jul 26 is broken, not empty.** Our current OTB for Jul is R3,087 on 1 room night against their 362,937 on 127 — that month has effectively no source coverage. It is published as if real, which also wrecks the TOTAL, ADR and occupancy for the month.
5. **Forecast values written into the Historical actuals grid.** Previous-OTB and Jan-27 figures were mapped into 2026/2027 Historical columns, inventing a 2027 year the source workbook never had.
6. **Fin Year sheet is empty** even though the imported Historical grid carries complete 2025 and partial 2026 monthly revenue and room nights.

Variance, Occupancy, ADR and the Revenue Comparison block are real formulas and are fine — they only look blank because the file has never been opened in Excel; recalculation on generation is a small extra win, not the problem.

## The corrections

**Sheet 1 — priority**

- Pick the comparison column by date, not by position: choose the newest OTB column strictly **older** than the run's own as-of date. When the workbook's newest column matches the run date, use the one before it (31 Jul here). Fall back to the newest column only if nothing older exists, and warn in that case.
- Store the chosen column's date on the run and use it for the `OTB @ …` heading everywhere on Sheet 1 (revenue, room nights, occupancy, ADR blocks) — no more `n/a`.
- Extend the run's month window to the union of parsed source months and imported baseline months, in chronological order, so Dec 26 and Jan 27 come back with their previous-OTB, last-year, dinner/Room 0/comp values.
- Mark months whose parsed coverage is implausible (parsed revenue a small fraction of the imported figure for the same month, or a closed month with no source file): use the imported figure as that month's OTB, label it as imported on the snapshot table, and log a run event. Nothing is silently overwritten — the reviewer sees which months came from the workbook.
- Show the comparison baseline on the run page as "Imported from 31.07.26 … , as-of 31 Jul 2026".

**Sheets 2 and 3 — follow-on**

- Never write a forward-looking OTB or a future month into the Historical actuals grid; only closed months, and no year column the workbook did not have.
- Populate Fin Year from the historical baseline (current and prior calendar year revenue and room nights) so its formulas resolve.
- Add the Historical occupancy block, TOTAL rows and ADR formulas that the reference workbook carries.

## Technical notes

- `supabase/functions/_shared/priorReportWorkbook.ts` — `parseOtbSheet`: select the OTB column by comparing parsed heading dates against a `runAsOfDate` argument instead of `dates[dates.length - 1]`; return both the chosen column's date and the workbook's newest date; keep per-block count-shaped detection as is.
- `supabase/functions/report-prior-workbook-import/index.ts` — pass the run's as-of date in, persist `baseline_source`, the chosen as-of date and month list into `report_runs.imported_baseline` / `baseline_source`; restrict the historical merge to closed months.
- `supabase/functions/_shared/reportImportedBaseline.ts` — add a month-union helper so the baseline can extend the window, plus a `coverage` result naming months sourced from the import.
- `nightsbridge-report-parser` (and the OPERA/PROTEL parsers, which share the helper) — build `months` from the union, apply the low-coverage substitution, write the imported as-of date to the snapshot, and log a `baseline_imported` run event.
- `supabase/functions/_shared/revenueReportWorkbook.ts` — read the previous as-of date from the snapshot for headings; fill Fin Year from the historical grid; add Historical occupancy/TOTAL/ADR.
- `src/components/reports/SnapshotTable.tsx` and `BaselineCard` copy — imported-month marker and baseline provenance line.
- Re-verify by regenerating the run for Torburnlea Homestead at 14 Aug 26 and reconciling Sheet 1 month by month against the uploaded workbook.
