# Source-shaped consolidated workbooks: OPERA and PROTEL

The Excel builder currently emits one layout for every source — a NightsBridge-shaped
grid (Dinner, Room 0, Comp RNs) with a thin Fin Year sheet. Compared against the two
reference consolidated workbooks it drops most of what those files carry, and the
importer that reads a client's seed workbook only takes revenue and room nights,
ignoring the occupancy, target and multi-year grids sitting next to them.

## What the reference workbooks have that we don't

OPERA — `20.08.26_Cathedral Peak-Revenue Report.xlsx` (sheets: OTB RR, Fin Year)

| Reference | Ours today |
| --- | --- |
| Revenue grid: OTB now, Target, LY Actual, OTB vs Target (value + %), Target vs LY (value + %), Actual vs LY (value + %), prior OTB, current vs prior | 7 NightsBridge columns; no Target, no three-way comparison |
| Occupancy block carrying occupancy % *and* room nights for both OTB and LY, plus prior-review occupancy | occupancy % derived only |
| ADR block referencing the revenue and nights cells above it, with OTB vs LY value and % | ADR block without % |
| Fin Year: current vs prior calendar year, Target (+10%), variance value and %, year totals, Room Nights beside Occupancy, ADR grid | Fin Year without targets or occupancy |
| Three charts embedded on the OTB RR sheet | no charts in the workbook |
| Dinner / Room 0 / Comp RNs absent (NightsBridge-only concepts) | printed for every source |

PROTEL — `14.08.26 Grande Roche Revenue Report.xlsx`

- Its own vocabulary: **AVR** (not ADR), **Occ %**, **vrs**, and a
  **"Variance last N days"** pickup pair (value + prior as-at column).
- Variance percentages divide by the OTB column, not by last year.
- Room Nights block prints occupancy beside nights in the same block.
- A **Fin Year** total row inside the grid rather than a separate TOTAL block.
- A **Historical Stats** sheet: ten years of revenue across, months down, with a
  matching ten-year occupancy grid and a latest-vs-prior variance column.
- **Online Res** and **Web Comparison** (rate-shopping) sheets.

## What changes

1. **Source-shaped workbooks.** The download picks its layout from the run's source:
   NightsBridge keeps today's grid; OPERA and PROTEL each get the structure above,
   with their own column sets, headings and wording. PROTEL keeps AVR / Occ % / vrs
   and the "Variance last N days" columns, where N is the day gap between this
   run's as-at date and the previous review.
2. **Targets come from the seed.** The importer reads the target column out of the
   client's own workbook — both explicit values and an uplift formula such as
   `=D4*1.1` or `=(D3*1.175)`. The recovered uplift is stored with the run and the
   generated Target column is written as a live formula using it, so the file the
   client knows keeps its own basis. When no target is found the column is written
   empty with the formula in place and a note on the run.
3. **A much deeper seed import.** Beyond revenue and nights the importer now absorbs:
   last-year occupancy per month, target values and uplift, prior-review occupancy
   and AVR/ADR, year totals, and every year present in a multi-year grid (revenue,
   room nights and occupancy). Occupancy is stored as occupancy — never mistaken for
   room nights, which is what corrupted the Cathedral Peak ADR figures.
4. **Historical sheet spans every year the seed provides**, with revenue, room
   nights, occupancy and derived ADR per year and a latest-vs-prior variance column.
5. **Charts in the workbook**: revenue, occupancy and ADR/AVR clustered column charts
   on the first sheet, pointing at the grid cells so they redraw when a figure is edited.
6. **PROTEL Online Res and Web Comparison sheets** are generated pre-formatted. First
   run they are blank for the team to fill in; on later runs they arrive pre-filled
   from the previous run's workbook so nothing is retyped.
7. Every derived figure stays a real Excel formula, and each block still carries the
   capacity legend and the OTB/LY notes.

## Technical notes

- `supabase/functions/_shared/revenueReportWorkbook.ts` splits into a shared
  primitives module plus three builders — `workbookNightsbridge.ts`,
  `workbookOpera.ts`, `workbookProtel.ts` — selected by `report_runs.source_type`
  through a small factory that keeps the existing `buildRevenueWorkbook` signature.
  Charts use ExcelJS `addChart` with cell-range references; if a chart type proves
  unavailable in the pinned ExcelJS build, the series are written as a hidden data
  block and the chart falls back to a plain formatted grid rather than breaking.
- `supabase/functions/_shared/priorReportWorkbook.ts` gains occupancy, target,
  target-uplift, per-year occupancy and year-total extraction, plus formula reading
  (currently only cached values are read). `isPlausibleNights` stays the gate for
  anything landing in a nights map.
- `supabase/functions/_shared/reportImportedBaseline.ts` and the `imported_baseline`
  payload extend with `last_year_occupancy`, `targets`, `target_uplift`,
  `historical_occupancy` and `carry_forward` (the PROTEL extra sheets); a migration
  adds `target_uplift numeric` and `carry_forward jsonb` to `report_runs`.
- `supabase/functions/revenue-report-excel/index.ts` passes source type, targets,
  uplift, occupancy maps and carry-forward data into the chosen builder.
- `src/components/reports/PriorReportImportCard.tsx` reports the extra blocks it
  found (targets, occupancy, years) so the team can see what was absorbed.
- Verification: generate the OPERA workbook for the Cathedral Peak 20 Aug run and the
  PROTEL workbook for Grande Roche, then diff sheet-by-sheet against the reference
  files — column headings, every formula, and the imported target/occupancy values —
  and confirm the workbook opens with zero formula errors.
