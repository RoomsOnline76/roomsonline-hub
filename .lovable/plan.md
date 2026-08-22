# Fix pasted-image width, occupancy scale and the ADR graph

Comparing the new Cathedral Peak draft (20 Aug) with the Canva original, three
confirmed problems remain.

## 1. Pasted screenshots print at half width

Almost every named section in the report media catalogue is defined with
`layout: "half"`. That renders its images inside a two-column grid, so a section
that holds a single screenshot fills only the left column — and because images
are grouped per typed heading, each group gets its own grid, giving different
widths from block to block (visible on the SiteMinder Data page: "Booking
performance" and "Current connected channels" print at different widths, both
about half the page).

Change:

- Every pasted screenshot prints at the **same full content width**, one image
  per row, regardless of the slot definition. The two-up option is retired for
  pasted media so nothing can render narrow again.
- The existing height cap stays, so a very tall screenshot is still capped rather
  than bleeding off the sheet.

## 2. Occupancy is ~50x too low (1.4% instead of 78.5%)

The property's report settings store `room_count = 3225` for Cathedral Peak. The
aggregator computes capacity as `room_count x days in month`, so capacity becomes
90 000–100 000 room nights and occupancy collapses to 1–2%. 3225 is a *monthly
capacity-days* figure, not a room count: July nights 2 532 / 3 225 = 78.5%, which
matches the original report exactly, so the real sellable-room count is ~104.

Change:

- Correct the stored room count for Cathedral Peak to the true sellable rooms.
- Add a sanity guard when a run is processed: if the configured room count
  implies an occupancy below a plausible floor (or exceeds the property's actual
  room inventory by a large factor), the run logs a readiness warning and the
  settings screen flags the field instead of silently producing a 1% occupancy
  chart.
- Show the derived capacity ("104 rooms x 31 days = 3 224 room nights") next to
  the field in Report Settings so the wrong kind of number is obvious.

## 3. The ADR graph is wrong

`previous_room_nights` imported from the prior workbook are fractions
(0.7655, 0.4004, ...) — occupancy percentages read out of the wrong column of the
consolidated workbook. Previous ADR is then `previous revenue / 0.4`, i.e. R5–9
million, which pushes the ADR chart axis into the millions and flattens the real
ADR bars to invisibility. The occupancy chart suffers the same distortion.

Change:

- Prior-workbook import rejects room-night values that are not plausible nights
  (a value below 1, or a non-integer fraction) instead of storing them, and logs
  what it dropped on the run.
- Chart/table maths ignores a previous-period ADR/occupancy when its nights
  figure is implausible, so one bad import can never rescale a chart.
- Re-import the Cathedral Peak prior workbook so the previous room nights come
  from the Room Nights grid, and re-process the 20 Aug run.

## Technical notes

- `supabase/functions/_shared/reportMediaSlots.ts` and
  `src/lib/reportMediaSlots.ts`: drop `half` from the layout union / force
  `full`; `revenueReportHtml.ts` always emits `.shots one-up` and removes the
  `two-up` rules.
- `supabase/functions/_shared/nightsbridgeAggregate.ts`: no formula change; the
  guard lives in the parser (`nightsbridge-report-parser`, plus the OPERA and
  PROTEL parsers which share the same `room_count` path) and is recorded through
  `logRunEvent`.
- `supabase/functions/_shared/priorReportWorkbook.ts`: nights validation
  (`Number.isInteger(value) && value >= 1`) before a nights map is written.
- `supabase/functions/_shared/revenueReportHtml.ts`: treat a month's previous
  nights as missing when implausible, so `adrPrev`/`occPrev` and their variance
  series are omitted for that month rather than exploding.
- Data fix: update `property_report_settings.room_count` for Cathedral Peak.
- Redeploy `revenue-report-draft` and the three parsers, then rebuild the 20 Aug
  draft and check page by page against the original: occupancy 69–78%, ADR
  R1 200–3 200, all pasted screenshots the same full width.

## One confirmation needed

Cathedral Peak's true sellable room count — the data implies **104**. Confirm
that (or give the correct number) and the settings fix uses it.
