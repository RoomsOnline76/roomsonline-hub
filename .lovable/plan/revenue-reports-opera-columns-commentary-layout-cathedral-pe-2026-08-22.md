# Revenue reports: OPERA columns, commentary layout, Cathedral Peak Feb window

Three fixes to the revenue report pipeline.

## 1. OPERA has no Dinner / Room 0 / Additional columns

OPERA's grid is a rooms-revenue extract only — those three columns are NightsBridge
concepts and currently print (empty) for every source.

- The OPERA adapter drops the Dinner and Other-non-rooms monthly fields; only
  complimentary room nights stay (they come straight off the extract) and the
  narrative notes remain.
- The manual inputs card renders only the monthly fields the run's adapter declares,
  so an OPERA run shows the comp-nights column and no Dinner / Room 0 boxes.
- The draft report and the workbook, for OPERA runs, omit the Dinner, Room 0,
  Comp RNs and Additional columns and their totals; "Total combined" becomes the
  OTB total. The "Additional revenue" KPI is replaced with a rooms KPI, and the
  fine-print line about dinner / Room 0 is dropped.
- NightsBridge keeps today's layout exactly; PROTEL keeps its own.

## 2. Revenue commentary bleeds off the page

The TOBI "Revenue Commentary" block currently prints as one long list on the revenue
performance page.

- Commentary moves to its own section, laid out as a calendar-style grid of month
  blocks (three across on A4, in chronological order), each block headed with the
  month and carrying that month's line.
- Lines that are not month-specific (and the reviewer's own commentary — minimum
  stay, promotions, rate overrides, general) print underneath the grid as "Overall
  commentary".
- Month blocks that do not fit flow onto a continuation page rather than being
  clipped; long text wraps inside its block instead of spilling.
- The section appears in the slide organizer so it can be moved or hidden.

## 3. Cathedral Peak: Feb belongs to 2027, not 2026

Confirmed from the run's data: the 20 Aug 2026 run's window is
Feb 2026, Jul 2026 … Feb 2027. The stray Feb 2026 row (R1.72m) comes from the
uploaded "Feb '26.pdf" being treated as a report month, which is why the Feb figures
read as 2026 and the grid has a gap between Feb and July.

- The report window is derived from the run's as-of month forward across the
  cadence's horizon; uploaded extracts for months that have already passed no longer
  create window months.
- Those past extracts are not discarded — they fold into the property's historical
  baseline, so Feb 2026 becomes the last-year actual for Feb 2027 instead of a row of
  its own.
- The run logs what it did ("Feb '26.pdf covers a past month — used as last-year
  actual") so the reviewer can see where the file went.
- Re-processing the Cathedral Peak run afterwards produces a Jul 2026 – Feb 2027
  window with Feb 2027 carrying its own OTB and the R1.72m as last year.

## Technical notes

- `src/lib/report-adapters/opera.ts`: monthly additional fields reduced to
  `comp_rns_by_month`; a `monthlyColumns` descriptor drives both the inputs card and
  the printed grid.
- `ManualInputsCard.tsx` becomes adapter-driven (fields from `getDefaultAdditionalFields`)
  instead of hard-coded dinner/room0/comp.
- `supabase/functions/_shared/revenueReportHtml.ts`: revenue table columns become
  source-conditional; new `commentaryPages` builder emits the month grid plus overall
  block, registered in `reportPages.ts` (and its `src/lib/reportPages.ts` twin) with
  print CSS (`grid-template-columns: repeat(3, 1fr)`, `break-inside: avoid`).
  Month attribution parses the leading `"<Month> - "` of each TOBI line against the
  snapshot months.
- `workbookPart-workbookOpera.ts` drops the three columns and their totals.
- New shared `reportWindow.ts` helper (as-of month + cadence horizon) used by
  `opera-report-parser`, `nightsbridge-report-parser` and `protel-report-parser`
  before `reconcileWithImportedBaseline`; past-month ledger rows route into the
  historical-baseline fold that already exists in each parser.
- Verification: re-process run `d9f5bab1…` and confirm the snapshot months start at
  2026-07, Feb 2027 carries last-year R1 724 820, then render the draft and check the
  commentary pages and OPERA grid at A4 for clipping.
