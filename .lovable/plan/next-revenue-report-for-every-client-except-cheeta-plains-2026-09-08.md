# Next revenue report for every client (except Cheeta Plains)

Run the next report for each property in the shared Drive folder, compare it to that
property's last issued report, and fix the pipeline wherever the numbers disagree.

## What is in the Drive folder

| Source system | Properties | Material found |
| --- | --- | --- |
| Nightsbridge | 55 on Main, Aire Del Mar, Ashbourne House, Explorers Club, Kunjani Villas, Mziki Safari Lodge, Torburnlea Homestead, Jembisa (Jembisa / Magari / Palala) | Monthly booking workbooks Jul 26 → Jan/Feb 27, extra workbooks (dinner, nationality), screenshots, and the filed report as PDF + Excel dated 13/14 Aug 26 |
| Opera-SiteMinder | Cathedral Peak | Monthly History & Forecast PDFs (Jul 26 → Feb 27) + filed report dated 20 Aug 26 |
| Protel | Hotel Krige, Grande Roche, Devonvale Golf & Wine Estate | Filed reports dated 13/14 Aug 26 (Krige and Grande Roche also as Excel) |
| RoomRaccoon | Les Chambres | Filed report dated 14 Aug 26 (PDF + Excel) |
| Semper-Nightsbridge | Schoone Oordt | Filed report dated 14 Aug 26 (PDF + Excel) |

Cheeta Plains is excluded, as asked.

## Decisions taken

- Reports are produced as real runs in the app, so each one is on record.
- Every run is dated as at 31 August 2026 — the month just closed.
- Comparison is on the figures only: revenue, room nights, occupancy, ADR and the
  totals row per month. Wording, layout and commentary differences are noted, not chased.
- Each finished pack is uploaded back into the property's Drive folder, in a new
  subfolder named for the run date.

## How the work is staged

Each stage is one group of properties: pull its Drive files, create the run, process it,
build the pack, compare against the filed report, then fix and re-run until the figures
reconcile. A stage is only closed when its properties reconcile or the remaining gap is
explained (for example the client's own pack rounded or was hand-edited).

1. **Torburnlea Homestead** — the reference Nightsbridge pack. Proves the loop end to end
   (files in, run, workbook, comparison, upload) before it is repeated.
2. **Nightsbridge singles** — 55 on Main, Aire Del Mar, Ashbourne House, Explorers Club,
   Kunjani Villas.
3. **Nightsbridge multi-lodge** — Mziki Safari Lodge (its comparison position is the pack
   sent a year ago) and Jembisa's three lodges.
4. **Cathedral Peak (Opera)** — nine monthly extracts, eight-month window from the month
   just closed, target of last year plus ten percent.
5. **Protel trio** — Hotel Krige, Grande Roche, Devonvale. These have no new day-level
   export in the folder, so each is built from its own filed pack: Grande Roche and Krige
   from the consolidated workbook, Devonvale from the printed comparison grid.
6. **Les Chambres and Schoone Oordt** — same approach from their filed workbook and PDF.
7. **Close-out** — a single summary of every property: figures matched, figures fixed, and
   anything still unexplained.

## Comparing and fixing

For each property the filed report is read back and set beside the generated one, month by
month. Where they differ, the cause is traced in the parser or aggregation for that source
before anything is changed, and the fix is made for the whole class of file rather than the
single property. Typical causes already known in this pipeline and worth watching: which
column counts as the current on-the-books position, room nights that must be derived from
revenue divided by rate, months present in one pack and not the other, and rows the client
excludes by name.

No client figure is ever typed in to force a match; if a number cannot be reproduced from
the source material, it is reported as unexplained.

## Technical notes

- Runs are created through the existing Revenue Reports run pipeline per source adapter
  (`nightsbridge`, `opera`, `protel`, `roomraccoon`), with `report_month` set to
  `2026-08-01` and the report profile, window shape and exclusion patterns already stored
  in `property_report_settings` left as they are unless a discrepancy proves one wrong.
- Drive files are fetched through the linked Google Drive connection and attached to the
  run as report files with the correct file role; prior packs are imported through the
  existing prior-report ingestion so the comparison column comes from the client's own
  last pack.
- Fixes land in the shared parsers and aggregation
  (`supabase/functions/_shared/*`, the per-source parser functions) plus focused tests for
  each reproduced discrepancy, so a corrected reading cannot silently regress.
- Upload of the finished workbook and PDF goes to a new dated subfolder in each property's
  Drive folder.

## Out of scope

- Cheeta Plains and its bespoke owner slides.
- Any change to report layout, wording or commentary generation.
- Sending anything to owners or clients.
