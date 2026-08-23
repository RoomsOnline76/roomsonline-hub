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
  legacy vintage; within those, the newest column dated **on or before** the run's
  as-of date is the comparison baseline, and the newest column of all is the
  current OTB.
- Stacked blocks are classified by their label: Revenue, Occupancy, Average Room
  Rate (ADR) and RevPAR — RevPAR is always skipped so it can never pollute revenue.
- Month rows with a real date cell state their own year; text month labels roll
  forward. Years outside 2005 … +5 are dropped.
- Room nights: an undated "Room Nights" column is trusted only when its values
  vary (a constant is rooms-available). Otherwise nights are derived as
  revenue ÷ ADR, for both current and last year.
