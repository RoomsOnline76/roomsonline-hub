# Revenue Reports — prior-year comparatives, editable TOBI feedback, booking trends, remembered layout

Four changes, all applied to every source system (NightsBridge, OPERA, PROTEL) rather than to one adapter.

## 1. Combine previous-year data before the report runs

The run builder already has the prior-report stages (`prior_upload`, `prior_ingest`) and stores what it reads on the run's imported baseline. Today that is used mainly to fill last-year columns for a first run.

Changes:

- The prior stage becomes multi-year: the reviewer can add one or more prior sources (consolidated workbook or an owner-report PDF) and label each with the year it covers. Every recognised year is merged into the property's historical baseline and into the run's imported baseline.
- A "Comparatives" panel on the stage lists which years are now available (e.g. 2018, last year, current) with the months found per year, so the reviewer sees exactly what the comparison will be built from.
- Merge is additive: an existing value is never overwritten unless the reviewer ticks "replace".
- Ingest runs before the build/insights stages, so the snapshot already carries the last-year and earlier-year series when TOBI is generated. A run event records the years imported.

## 2. TOBI feedback editable inline and persistent

The conservative narrative is already editable and saved; flags/suggestions have selection rows but the second-opinion (experimental) replies and the suggestion blocks are not consistently editable.

Changes:

- Every reply block — conservative and experimental, per flag, per suggestion field, plus the headline — gets the same inline edit affordance: click to edit, save, and a "revert to TOBI's wording" action.
- All edits persist on the run's insight row (edited text keyed per reply, experimental keys namespaced so they never collide). Regenerating insights keeps reviewer-edited text and marks it as edited rather than discarding it.
- The printed report and the draft use the edited wording wherever it exists, for both conservative and experimental replies that are ticked for inclusion.

## 3. Booking-trend metrics

Three new metrics, computed from the booking ledger:

- Average length of stay (per month and for the window).
- Which weekdays bookings are *received* on (booking-made date) and which weekdays stays *arrive* on.
- Booking lead time — days between the booking being made and arrival, as a distribution (0–7, 8–30, 31–90, 91+ days) plus the average.

Arrival-weekday and length-of-stay come from data every source already provides. Booking-made date is not currently captured, so the parsers gain an optional "date booked / made on" column with the same tolerant header detection used for the other columns. When no booking-made date is found, the received-weekday and lead-time panels are skipped with a short "source export does not include a booking date" note — nothing is estimated or invented.

The trends page joins the printed pack as its own slide, ordered and hideable like any other page, and its figures are included in the data TOBI reads.

## 4. Remembered layout per property

New runs inherit the previous run's presentation automatically, with a reset:

- Slide/section titles, per-image captions, custom slots and the slide order are saved as a per-property layout template when the reviewer edits them.
- Creating a new run for that property pre-fills section titles, custom slots and page order (including hidden pages) from that template. Captions are pre-filled per slot where the new run has an image in the same slot.
- A "Reset to defaults" action on the organizer clears the inherited layout for the run; a "Save as this property's default layout" action re-captures the current run's arrangement.
- Titles and captions stay run-editable; editing them updates the property template so the next run remembers the latest wording.

## Technical notes

- Schema: `property_report_settings` gains `report_layout_template jsonb` (slot titles, captions, custom slots, page order and hidden keys). `report_runs` imported-baseline payload gains per-year provenance entries. `report_insights.selections` carries `edited: true` alongside the existing `include`/`text` per key. `report_snapshots` gains a `booking_trends` block (ALOS, arrival/booked weekday counts, lead-time buckets) written by the parsers.
- Parsers: add `booked_date` to the ledger field list, aliases and reviewer mapping in `_shared/nightsbridgeLedgerParse.ts`; PROTEL and OPERA pass it through when their extract exposes it. Trend maths lives in a new `_shared/reportBookingTrends.ts` so all three parsers share it.
- Insights: `reports-xai-insights` receives the multi-year comparatives and the trends block in its scoped payload, keeps the existing report-window scoping, and preserves reviewer-edited text on regeneration.
- Frontend: `StagePriorUpload`/`StagePriorIngest` gain the multi-year list; `AiInsightsPanel.tsx` gets one shared editable reply component; `SlideOrganizer`/`ReportMediaSlots` and `useReportPageOrder`/`useReportMedia` read and write the property layout template; a new `BookingTrendsCard` and a matching page in `_shared/reportPages.ts` + `revenueReportHtml.ts`/Excel builder.
- Grants and RLS follow the existing reports pattern; edge functions redeployed after the change.
