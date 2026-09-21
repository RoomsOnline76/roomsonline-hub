# Cheetah Plains daily report: read the created and cancelled reservation files, show the confirmed/provisional split on page one, real Word file and a Canva pack

## 1. The two movement files were never read

Two spreadsheets travel with every day's upload and both were skipped:

**`creation_<from>-<to>.xlsx` — reservations created.** A protel Reservation list saved as a spreadsheet instead of a PDF:

```text
Arrival | Departure | Nights | Room | RT | Persons | Res. status | Res. No. | Linked Profile 1 | Avg. Price
07.10.27 | 10.10.27 | 3 | 1 | Mapogo | 8 | Provisional | 5221 | Source Black Tomato | 412 776,00R
Total | 26 | 357 082,69R
```

**`VoidStat_<timestamp>.xlsx` — reservations cancelled.** A Cancellations print: a header block (`Cancellations`, booking date, void type), then one block per cancelled reservation with reservation number, room count, negative accommodation amount, guest/source and an arrival/departure line beneath it, ending in a void reason.

The day's report only accepted a file whose name contained `housestate`, `provisional`, `daily`, `villa` or `state`, or a PDF — so both were filed as "monthly export — not used by the daily report" and the day's movement lines printed as dashes.

Fix:

- Recognise both by their consistent name prefixes (`creation_…` = created, `void…`/`VoidStat_…` = cancelled) **and** by their contents, so a renamed export still reads.
- Created: read the reservation grid — count, nights, value, the printed From/To window and the per-status split (Confirmed / Provisional / Waitlist).
- Cancelled: read each cancellation block — count, nights from arrival/departure, value as the absolute of the negative amount, and the status where the print carries one.
- Any spreadsheet is now given a look before being dismissed on its name.

## 2. Confirmed and provisional on page one

Page one's figures already keep the two apart; the files that carry the split were the missing piece. After the fix, page one prints:

- Revenue on the books, occupancy and ADR from the **confirmed** prints only.
- Each movement line — created and cancelled — with its status split (Confirmed, Provisional, Waitlist), counts and nights shown separately, never merged.
- Provisional villa nights and value on their own labelled line, never added into revenue.

The 21 September run is re-read and the printed page one checked line by line against the uploads before reporting back: the four created reservations (all Provisional, 26 nights) must sit under Provisional, the Karula cancellation (15–19 Sept, 4 nights, R129,675) must appear on the cancelled line, and nothing of the provisional business may land in revenue on the books.

## 3. Editable file: a real `.docx`, plus a Canva pack

Today's "Word" download hands Word an HTML page named `.doc`, which is why Word treats it as a foreign document. It is replaced with a genuine `.docx` package holding the same report page: Word opens it with no notice, the layout, tables, graphs and colours are the PDF's, and the text is editable.

- The button reads **Word (.docx)** everywhere it appears: the daily build step, the report viewer and the dashboard history.
- Beside it, a **Canva pack** download for daily reports — the same asset pack monthly runs produce: chart SVGs, one CSV per table, a JSON manifest and the report page, zipped.

## Technical notes

- `supabase/functions/_shared/protel/reservationList.ts` (new): reader for the created grid — header detection, `DD.MM.YY` dates, nights, `Res. status` bucketing, Total row, From/To window.
- `supabase/functions/_shared/protel/voidStat.ts` (new): reader for the Cancellations print — block splitting on `RE_`/`Res.` rows, negative-amount value, arrival/departure nights, guest/source, void reason.
- Both return the existing `DailyMovement` shape tagged `created | cancelled`.
- `cheetaplains-daily-report/index.ts`: broaden `isDailyFile` to let any spreadsheet through; add created and cancelled branches to the sheet recognition order (House State → pipeline → creation list → void list → provisional); keep the one-file batch and per-file attempt limits; uploaded movement files take precedence over the pipeline fallback.
- Word: `src/lib/reports/wordDownload.ts` emits a real `.docx` package (OOXML wrapping the report page as an `altChunk`, same `@page` setup); call sites `StageDailyBuild.tsx`, `ReportsDraftView.tsx`, `RunHistoryList.tsx` keep working, labels updated.
- Canva pack: `mode: "pack"` branch in `cheetaplains-daily-report` mirroring `revenue-report-draft`'s pack (charts/, tables/, manifest.json), stored at `<property>/<run>/canva-pack-<date>.zip`, surfaced beside the PDF and Word buttons.
- Then re-run the 21 September build and verify the stored figures and printed page one against the uploads.
