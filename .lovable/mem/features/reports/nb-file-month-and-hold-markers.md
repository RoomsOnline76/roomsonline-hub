---
name: NightsBridge file-month attribution & hold markers
description: NB exports are attributed to the file's own reporting period; holds are detected by label/room-name, and their revenue still counts
type: feature
---

Verified against the golden packs for Kunjani, Aire Del Mar, Ashbourne, Mziki and 55 on Main (revenue, room nights, ADR and occupancy tie month for month).

## Month attribution
A bookingsummary is pulled one month at a time and repeats stays that started earlier but occupy nights in the reported month. The **export's own period line** ("… from 01/11/2026 to 30/11/2026") decides the month for every row in the file — never the arrival date. Fallbacks in order: file name (`… _Nov 26.xlsx`), then the modal arrival month. The basis is printed in the file's parse notes.

## Holds vs guests
- Status (`Unavailable`, etc.) **never** decides on its own: operators host real guests free of charge on unavailable rooms and those nights are sold.
- A row is a hold when its occupant label says so (block, close/closed, not available, maintenance, owner use, out of order, repair, hold/held, placeholder `x`/`-`/`n/a`, or empty) **or** when the guest field holds one of the export's own room names ("Kunjani Suite" booked against Presidential Villa).
- Money on a hold, excluded or unavailable line is still accommodation revenue; only its nights leave room nights. Room 0, Events and holding-in-credit stay separate revenue streams.
- Zero revenue alone is not exclusion: comp/tour-operator nights count as room nights and are reported as complimentary nights.

## Property rules
`nb_profile` keep/exclude patterns accept field scoping — `guest:`, `company:`, `room:`, `source:`, `status:`, `type:` — for holds a label rule cannot recognise. Keep-list always wins over hold detection.

## Cross-check
The export's own totals line is captured as `declaredRevenue` and compared with the parsed rows in the file notes, so a parse gap is visible without opening the workbook.

Known reference quirks: the 55 on Main golden workbook repeats December's figures in November (the November export itself totals 14,445.14 / 5 nights); Ashbourne's Aug golden drops one 0.00 unavailable night ("courtney") that no label rule can identify — add it to that property's exclude list if it recurs.
