# Cheetah Plains daily report: read the reservation lists, split confirmed vs provisional, real Word file and a Canva pack

## 1. The 21 September spreadsheet was never read

`creation_2026-09-18-2026-09-20-2.xlsx` is a protel **Reservation list** — the created-reservations print, saved as a spreadsheet instead of a PDF. Its rows read:

```text
Arrival | Departure | Nights | Room | RT | Persons | Res. status | Res. No. | Linked Profile 1 | Avg. Price
07.10.27 | 10.10.27 | 3 | 1 | Mapogo | 8 | Provisional | 5221 | Source Black Tomato | 412 776,00R
...
Total | 26 | 357 082,69R
```

The daily report only accepts a file whose name contains `housestate`, `provisional`, `daily`, `villa` or `state`, or that is a PDF. A file named `creation_…xlsx` falls outside that list and is filed as "monthly export — not used by the daily report", so the day's created reservations were silently dropped.

Fix:

- Recognise a reservation list by its **contents**, not its filename: a sheet whose header row carries Arrival / Departure / Nights / Res. status.
- Read it into the same shape the PDF print produces: total count, nights, value, the printed From/To window, and the per-status split.
- Decide created vs cancelled from the sheet and filename wording (`creation`, `created` vs `cancel`), the same way the PDF prints are classified.
- Any spreadsheet is now given a look before being dismissed, so a renamed export is no longer skipped on its name alone.

## 2. Confirmed and provisional in the printed report

Both are already kept apart in the day's figures and printed on their own lines; the reservation list above is where the split comes from, and it was not being read. After the fix:

- Revenue on the books, occupancy and ADR come from the **confirmed** prints only.
- Each movement line (created, cancelled) prints its status split — Confirmed, Provisional, Waitlist — with counts and nights, never merged.
- Provisional villa nights and value print on their own labelled line and are never added into revenue.

The 21 September run will be re-read and the printed report checked line by line against the uploaded sources before reporting back: the four created reservations (all Provisional, 26 nights) must appear under Provisional, and nothing of them may land in revenue on the books.

## 3. Editable file: a real `.docx`, plus a Canva pack

Today's "Word" download hands Word an HTML page named `.doc`, which is why Word treats it as a foreign document. Replacing it with a genuine `.docx` package containing the same report page: Word opens it without any notice, the layout, tables, graphs and colours are the PDF's, and the text is editable.

- The button becomes **Word (.docx)** everywhere it appears: the daily build step, the report viewer and the dashboard history.
- Alongside it, a **Canva pack** download for daily reports — the same asset pack monthly runs already produce: chart SVGs, one CSV per table, a JSON manifest and the report page, zipped, ready to drop into Canva.

## Technical notes

- `supabase/functions/_shared/protel/reservationList.ts` (new): pure reader for the Reservation list grid — header detection, `DD.MM.YY` dates, nights, `Res. status` bucketing, Total row, From/To window; returns the existing `DailyMovement` shape plus `created | cancelled`.
- `cheetaplains-daily-report/index.ts`: broaden `isDailyFile` to let any spreadsheet through, add a reservation-list branch in the sheet recognition order (House State → pipeline → reservation list → provisional), keep the one-file batch and per-file attempt limits.
- Word: swap `src/lib/reports/wordDownload.ts` to emit a real `.docx` package (OOXML document wrapping the report page as an `altChunk`, with the same `@page` setup), keep the same call sites — `StageDailyBuild.tsx`, `ReportsDraftView.tsx`, `RunHistoryList.tsx` — and update the labels.
- Canva pack: add a `mode: "pack"` branch to `cheetaplains-daily-report` mirroring `revenue-report-draft`'s pack (charts/, tables/, manifest.json), store at `<property>/<run>/canva-pack-<date>.zip`, and surface it beside the PDF and Word buttons on the daily build step and in the dashboard row.
- Then re-run the 21 September build and verify the stored figures and the printed report against the uploads.
