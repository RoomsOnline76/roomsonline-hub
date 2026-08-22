# Source-aware report section headers

## The problem

The pasted-image section catalogue is hard-coded with NightsBridge wording ("Booking engine performance / hits", "Booking totals — last year vs this year", "Minimum stay", "Promotions & rate overrides"). The OPERA sample final report uses a different set of headings — SiteMinder Data, Booking Performance, Current Connected Channels, Channel Mix, Room Type Performance, Rate Plan Performance, Booking.com Data, Ranking Score, Promotion Stats. Because the app only offers the NightsBridge headings, OPERA/PROTEL runs get dumped into "Additional Slides" and titled by hand every time.

## What changes

1. **Slot catalogue becomes source-aware.** One shared catalogue keyed by `report_runs.source_type` (`nightsbridge`, `opera`, `protel`), with a common core every source shares and source-specific sections on top.

   - Shared: `Booking.com`, `Expedia`, `Traveller Trends` media, `Additional Slides`.
   - NightsBridge (unchanged, so existing runs keep their pages): Channel Performance — hits, booking totals, minimum stay, promotions & rate overrides.
   - OPERA: SiteMinder Data (booking performance, current connected channels), Channel Mix, Room Type Performance, Rate Plan Performance; Booking.com set gains Ranking Score.
   - PROTEL: starts from the OPERA set (closest match) until real PROTEL samples land, minus SiteMinder-specific slots.

2. **Headings follow the chosen source automatically.** The paste-in UI, the slide organizer and the printed pages all read the same source-resolved catalogue, so switching a run's source relabels the sections instead of forcing manual slides.

3. **Every section title is editable and saved.** Built-in sections get the same rename affordance custom slides already have, stored per run, so a property can tweak wording (e.g. date ranges in "Promotion Stats | Last 30 Days") once and have it print.

4. **Nothing is lost on existing runs.** Slots keep their existing keys; images already uploaded stay attached, and saved page orders are reconciled the same way legacy media keys already are.

## Technical notes

- `src/lib/reportMediaSlots.ts` and `supabase/functions/_shared/reportMediaSlots.ts` (kept in step) export `slotsForSource(sourceType)` plus the shared/per-source arrays; `MEDIA_SECTIONS` becomes a function of source. `src/lib/reportPages.ts` / its server twin derive `DEFAULT_PAGE_ORDER` from the resolved catalogue.
- `useReportMedia`, `ReportMediaSlots`, `SlideOrganizerCard`, `useReportPageOrder` take the run's `source_type` (already on `report_runs`, read in `ReportsRunReview`) and pass it down.
- `revenue-report-draft` resolves the catalogue from the run row instead of importing the fixed array; `revenueReportHtml.ts` keeps rendering whatever definitions it is handed, so only the definition source changes.
- Title overrides reuse the existing `report_media_slots` table: a row whose `slot_key` matches a built-in key acts as a per-run label override (no new table). Migration only adds an `is_override` marker if needed for clean separation from custom slides.
- Order of work: catalogue + resolver, then draft/HTML wiring, then UI (paste cards + organizer), then title overrides. Verify by rebuilding one NightsBridge run (headings unchanged) and the Cathedral Peak OPERA run (OPERA headings, no manual slides needed).
