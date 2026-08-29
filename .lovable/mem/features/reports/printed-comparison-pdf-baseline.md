---
name: Printed comparison-PDF baseline
description: Devonvale-style revenue reports arrive only as a printed comparison grid PDF; how it is parsed and how nights/ADR are derived
type: feature
---

- Some clients (Devonvale) have no PMS export and no workbook — only the printed
  consolidated report PDF with stacked comparison grids (Revenue, Occupancy, ADR,
  RevPAR). `_shared/priorComparisonPdf.ts` reads it; `report-prior-workbook-import`
  routes a PDF to the comparison reader, the owner-pack reader, or the workbook
  reader by page signature.
- Grid rules: block kind is read from label cells in the grid's own left column
  (x < 320) — chart captions and the sheet title print on the same visual line and
  must not be matched. RevPAR blocks are always skipped.
- A month-labelled row with fewer than two numbers is part of the two-line column
  heading (`Aug 2026 | July 2026 | Actual`), not data.
- As-of dates come from the heading, else from the legend text
  (`OTB @ 13 August 2026`, `OTB @ 31 July 2026`) — newest is current, next is previous.
- Nights are revenue ÷ printed ADR; occupancy read-back is only the fallback.
  `aggregateFromImportedBaseline` prefers printed nights, then ADR-derived nights,
  and never invents ADR.
