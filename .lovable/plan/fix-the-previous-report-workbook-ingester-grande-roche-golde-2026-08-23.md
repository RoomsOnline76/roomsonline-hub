# Fix the previous-report workbook ingester (Grande Roche golden example)

## What actually went wrong

The Grande Roche pack's live grid is the **Revenue** sheet, headed
`Grande Roche Revenue On the Books @ 14 August 2026`, with month rows Jul 2026 – Jan 2027 in
four stacked blocks (Revenue, Occupancy, Average Room Rate, RevPAR) and columns
`OTB 14.08.26`, `OTB 29.07.26`, `Variance`, `Last Year Actual`, `Budget / Target`.
The multi-year grids live on **Historical Stats** (Revenue / Occupancy / ADR, 2015–2026).

The ingester never read that sheet. Confirmed causes:

1. **Dated columns are only recognised when they contain an `@`.** The detector requires
   `OTB @ …` / `as @ …`. Grande Roche writes `OTB 14.08.26` and `OTB 29.07.26`, so no header
   row is found and the whole sheet is discarded as "not an OTB grid".
2. **With the real sheet discarded, the legacy vintages win.** The workbook also holds
   `09.12.19`, `24.08.2020`, `Studio Revenue`, `Sheet1`, `VA`, `QV`, `DH` — other hotels and
   older vintages that *do* use `as @`. Those became the baseline, which is why the run showed
   only the months that came from elsewhere and nothing for Jul, Oct, Nov, Dec 2026.
3. **Month rows are real date cells**, and the year is currently re-derived by rolling forward
   from the as-of year instead of being taken from the date itself.
4. **`RevPAR` is not classified**, so it falls through to "revenue" and its per-night values can
   be written into the revenue map.
5. **Room nights sit in a plain `Room Nights` column** (no dated heading), so nights were not
   picked up from the occupancy block.

## The fix

### 1. Recognise undated-style OTB headings
Accept a dated column heading with or without `@`: `OTB 14.08.26`, `OTB 14/08/26`,
`OTB 14 Aug 2026`, `On the books 15 July 2013`, alongside the existing `@` forms. Date parsing
handles `dd.mm.yy`, `dd/mm/yyyy` and `dd Month yyyy`, and rejects a heading with no readable date
rather than guessing.

### 2. Prefer the sheet that matches the property and the run
Rank candidate OTB sheets by: readable as-of date closest to but not after the run's as-of date,
then by how many window months they cover, then by whether the sheet's own title mentions the
property. Sheets from other hotels and decade-old vintages may still fill gaps, but only behind
the winning sheet, and every sheet used is named in the preview.

### 3. Trust real date cells for the year
When a month label is a date cell, take its year directly; keep the roll-forward rule only for
text labels ("Jul", "Aug", …). Months outside a plausible reporting range are dropped with a
warning instead of silently landing in the baseline.

### 4. Classify all four blocks
Add `RevPAR` (and `rev par` / `revenue per available room`) to the skipped block kinds so its
values never reach the revenue map. Pick up an undated `Room Nights` / `RN` column inside a
revenue or occupancy block as the nights source, keeping the count/fraction plausibility guard.

### 5. Read what the pack already carries
From the winning block set, capture per month: current OTB revenue, previous OTB revenue,
last-year actual, occupancy (current and last year), ADR, room nights, and the target column.
From **Historical Stats**, capture the revenue, occupancy and ADR year grids (the year-vs-year
variance columns are ignored — they are derived).

### 6. Make gaps visible in the preview
The ingest step (Stage D) lists, per window month, which figures were found and which sheet each
came from, and warns explicitly when a window month has no previous-OTB value — so an
under-read workbook is caught before the run is built, not after the report prints.

## Verification

Re-run the ingest against `14.08.26_Grande_Roche_Revenue_Report.xlsx` and confirm the preview
shows previous OTB (as at 29.07.26), last-year actual, occupancy, ADR and room nights for
**Jul, Aug, Sep, Oct, Nov, Dec 2026 and Jan 2027**, plus historical revenue for 2015–2026, and
that no value originates from the V&A / Queen Victoria / Dock House sheets.

## Technical notes

- `supabase/functions/_shared/priorReportWorkbook.ts`: `OTB_HEADING` widened to an optional-`@`
  dated-heading matcher; `parseOtbDate` fed the whole heading; `blockKind` gains a RevPAR skip;
  nights-column detection extended to undated `Room Nights` headings; month-row year taken from
  date cells; sheet ranking extended with window-coverage and title-match tie-breakers;
  per-field provenance added to the extract.
- `report-prior-workbook-import`: pass the run's report month/window through, return the
  per-month/per-field provenance and missing-month warnings in the preview payload.
- `src/hooks/useReportPriorImport.ts` + `src/components/reports/PriorReportImportCard.tsx`:
  surface the provenance table and missing-month warnings; strict types, semantic tokens.
- Redeploy `report-prior-workbook-import` and the three parsers after the change.
