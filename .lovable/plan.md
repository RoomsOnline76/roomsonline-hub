# Protel ingest, wizard notes step and owner slides

Four fixes to the Revenue Reports pipeline, driven by the Grande Roche (PROTEL) run.

## 1. Protel source files are never read — root cause found

The two Grande Roche `HouseState_*.xlsx` uploads are real xlsx zips, but protel writes every
XML part (`workbook.xml`, `sheet1.xml`, `[Content_Types].xml`, `.rels`, `sharedStrings.xml`)
in **UTF-16 big-endian** with a `FE FF` byte-order mark. The spreadsheet library used by the
parser assumes UTF-8 and throws `Unknown Namespace:` on the first part it reads, so the file
is logged as "unreadable workbook" and no House State rows ever reach the run. Confirmed by
running the library directly against both reference files: it fails on the raw file and parses
cleanly (139 rows, `Page 1` sheet, correct daily grid) once the parts are transcoded.

Fix:
- New shared helper (`supabase/functions/_shared/xlsxRepair.ts`): open the upload as a zip,
  detect a UTF-16 BE/LE BOM on each text part, decode it, rewrite the XML declaration to
  `utf-8`, rebuild the archive, and hand that to the reader. Files without a BOM pass through
  untouched, so nothing changes for NightsBridge/OPERA.
- Use the helper in `protel-report-parser` (and the other two parsers plus the prior-workbook
  importer, since the same protel exports can be dropped there).
- Log a run event when a workbook needed repair, so the timeline shows what happened.
- Verify against both reference House State files: day rows, implied room count and the
  monthly aggregate must come through, and the run must reach `ready`.

The existing Grande Roche run is left in place and re-processed with the "Process" button once
the parser is fixed.

## 2. Notes step is skippable in the wizard

Today "Create run" only exists on step 4 (Notes), so the reviewer must walk through it for
every source. Change: on the Files step, add a **Create run** action next to "Continue",
and label the Notes step as skippable ("Notes — optional, can be added on the review page").
Same behaviour for NightsBridge, OPERA and PROTEL. Notes stay editable on the run review page,
so nothing is lost by skipping.

Parsing still starts from the manual **Process** button on the review page, as chosen.

## 3. Protel slide sections realigned to the golden report

Read from `docs/reference/protel/final-report/29.07.26 Revenue Report Grand Roche Hotel.pdf`,
the printed order of screenshot sections is:

```text
ProfitRoom Stats | Last 30 Days      sales summary, channel revenue, pickup, popular arrival dates
Siteminder Same Time Last Year       room nights by channel, room revenue by channel
Booking.com Data                     scores, area demand, pace of bookings, search window,
                                     length of stay, device, top 5 countries, cancellation policy
Booking.com Promotion Stats | Last 30 Days
Booking.com Rate Plans | Last 30 Days
Expedia Performance | Last 28 Days
Expedia Promotion Stats | Last 28 Days
Additional Slides                    free-form, one page per image
```

The current protel catalogue instead reuses the OPERA shape ("Channel Performance",
"Channel & Room Performance", generic Booking.com/Expedia slots). Replace the PROTEL slot list
in `src/lib/reportMediaSlots.ts` and its mirror in
`supabase/functions/_shared/reportMediaSlots.ts` with slots matching the headings above, so the
paste-in cards, the printed page headers and the slide organizer all follow the golden report.
NightsBridge and OPERA catalogues are untouched. Images already pasted against retired protel
keys stay visible through the existing orphan-slot handling.

## 4. Owner slides limited to Cheetah Plains

The optional owner-slides toggle currently appears on every run's review page and in the
wizard for any property. Restrict it: the wizard checkbox and the review-page card render only
when the property's report settings have the Cheetah Plains set configured; every other
property sees nothing about owner slides. Runs that never had the set stay unaffected.

## Technical notes

- Files: `supabase/functions/_shared/xlsxRepair.ts` (new), `protel-report-parser`,
  `opera-report-parser`, `nightsbridge-report-parser`, `report-prior-workbook-import`,
  `src/lib/reportMediaSlots.ts` + `supabase/functions/_shared/reportMediaSlots.ts`,
  `src/lib/reportPages.ts` (page titles follow the slot sections),
  `src/pages/reports/ReportsNewRun.tsx`, `src/pages/reports/ReportsRunReview.tsx`.
- No schema change; `special_report_set` already exists on runs and property settings.
- Verification: re-process the Grande Roche run, confirm snapshot months and totals, then open
  the draft and check the protel section pages print in the golden order.
