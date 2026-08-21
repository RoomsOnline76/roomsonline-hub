# OPERA report adapter

Add OPERA as a fully working report source alongside NightsBridge. Nothing in the NightsBridge path, the aggregation engine, the Excel builder or the draft-report renderer changes — OPERA plugs in behind the same adapter interface.

## What the OPERA source actually is

The golden samples in `docs/reference/opera/source/` are Oracle OPERA **History and Forecast** PDFs — one per month, each a daily grid rather than a booking list. Every row is a date with: rooms occupied, arrival rooms, comp rooms, house use, deduct individual / group, occupancy %, room revenue, average rate, departures, day-use, no-show, out-of-order rooms and adults & children. Each page ends with History / Forecast subtotals, a month Total row, and a filter footer stating the date range.

The consolidated Cathedral Peak workbook is the same "OTB RR" + "Fin Year" structure the NightsBridge path already produces (revenue block, room occupancy block, ADR block, target = last year × 1.1, prior-snapshot comparison columns), so no workbook or PDF template work is needed — only a normalised ledger that feeds it.

## What gets built

**1. New `opera-report-parser` edge function**
- Accepts `{ run_id, file_id? }` and returns `{ rows_parsed, months, files_parsed, files_pending, status }`, exactly like the NightsBridge parser, so the existing run pipeline, event log and re-parse buttons work unchanged.
- Reads each uploaded PDF from storage, extracts its text layer, and parses the daily grid: date, rooms occupied, room revenue, average rate, occupancy %, comp rooms, house use, individual vs group split, out-of-order rooms.
- Ignores the History/Forecast subtotal and Total rows for summing (they are used only as a self-check: parsed daily sums must reconcile with the printed month total, otherwise the file is rejected with a clear message).
- The month a file belongs to comes from the filter footer date range, not the filename.
- Writes `report_snapshots` through the same shared aggregation call the NightsBridge parser uses, then applies the same previous-run baseline, last-year actuals, manual extras and historical-baseline backfill logic.

**2. Normalised ledger shape for OPERA**
- One synthetic ledger row per business date: arrival = that date, nights = rooms occupied that night, revenue = that day's room revenue. Summed by month this reproduces the printed month totals and gives correct room nights, ADR and occupancy.
- Segment split: individual vs group deduct columns become the channel breakdown ("Direct / Individual" and "Group"), since OPERA's history report carries no OTA source detail. This is stated on the run page so nobody reads it as a channel report.
- Comp rooms and house use are captured as non-sellable nights so they never inflate ADR.
- Room count: taken from the property's saved sellable-room count, with the printed occupancy % used to cross-check it (rooms occupied ÷ occupancy %). A material mismatch is surfaced as a warning on the run, not a hard failure.

**3. Adapter flipped to ready**
- `src/lib/report-adapters/opera.ts` moves from `planned` to `ready`, with the real expected field list (the History & Forecast column names), `acceptedFileTypes: [".pdf"]`, and default additional fields: comp room nights pre-filled from the parsed comp/house-use columns, dinner and other-revenue left for the reviewer.
- Mirrored in `supabase/functions/_shared/reportSourceAdapters.ts`.

**4. Upload path becomes adapter-driven**
- The source-file upload helper and both drop zones currently hard-code `.xlsx`/`.xls`. They will read the accepted extensions and validation message from the selected run's adapter, so an OPERA run accepts PDFs and a NightsBridge run keeps accepting workbooks only.

**5. Docs**
- `docs/reference/Revenue-Reports-Source-Adapters.md` gains an OPERA section: file shape, field mapping, the reconciliation check, and the segment-breakdown limitation.

## Verification

- Parse all nine Cathedral Peak monthly PDFs into a run and compare the resulting month revenue / room nights / ADR / occupancy against the consolidated workbook's OTB column (Jul 3,815,054.19; Aug 3,008,232.43; Sept 1,963,815.77; Oct 2,350,244.70; Nov 809,645.02; Dec 2,928,664.02; Jan 567,035.51; Feb 247,327.07 and matching room nights 2532 / 1824 / 1631 / 1670 / 620 / 928 / 305 / 175).
- Generate the Excel pack and the draft visual report for that run and confirm both render with the same sections and branding as the Cathedral Peak final PDF.

## Technical details

- PDF text extraction inside Deno via `npm:unpdf` (`extractText` over the document proxy); the samples carry a real text layer, so no OCR is required. Files without extractable text fail with an explicit "scanned PDF not supported" message.
- Row parsing is a fixed-order numeric tokeniser anchored on the leading `DD-MM-YY Ddd` date token, tolerant of the variable column padding seen between the History and Forecast blocks.
- Per-file processing keeps the NightsBridge parser's incremental, one-file-per-invocation guard so multi-month runs cannot hit the edge-function timeout.
- Ledger rows reuse the existing `LedgerRow` interface and `aggregateLedger` from `_shared/nightsbridgeAggregate.ts` unmodified; OPERA-specific normalisation lives in a new `_shared/operaHistoryForecast.ts` with unit tests over one sample month.
