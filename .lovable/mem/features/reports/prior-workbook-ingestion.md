---
name: Prior report workbook ingestion
description: How the legacy consolidated revenue workbook is read — sheet ranking, dated column detection, block kinds and derived room nights
type: feature
---

`supabase/functions/_shared/priorReportWorkbook.ts` rules (Grande Roche is the
reference pack):

- Dated OTB headings may or may not carry `@`: `OTB 14.08.26`, `OTB @ 14 August
  2026`, `as @ 8 Nov 2017`. Comparison headings (`OTB vs LY`, `Variance …`) are
  never dated columns.
- A dated heading only counts when its own block actually holds numbers — hand-kept
  packs leave a decade of stale headings above empty columns.
- Sheet ranking: sheets covering the run's own reporting months outrank every
  legacy vintage. The newest dated column of the winning sheet is the current OTB;
  the comparison baseline is the newest column **strictly older** than it and no
  later than the run's as-of date (a 14 Aug run against a `OTB 14.08.26` /
  `OTB 29.07.26` pack must not collapse both onto one column).
- The winning sheet owns its own months: a legacy vintage may only fill months the
  winner never printed, and may never extend the window past the winner's last
  month. Prior-year (`<year> ACTUAL`) buckets are exempt from that window.
- Stacked blocks are classified by their label: Revenue, Occupancy, Average Room
  Rate (ADR) and RevPAR — RevPAR is always skipped so it can never pollute revenue.
- Month rows with a real date cell state their own year; text month labels roll
  forward. Years outside 2005 … +5 are dropped.
- Room nights: an undated "Room Nights" column is trusted only when its values
  vary (a constant is rooms-available). Otherwise nights are derived as
  revenue ÷ ADR — for the current OTB column too, since prior-workbook-only
  properties (Grande Roche) build the printed grid from that column's own
  occupancy, ADR and nights.
