# PROTEL Adapter + CheetaPlains Special Reports

Add PROTEL as a live report source and give CheetaPlains two extra owner-report pages, without touching the NightsBridge or OPERA paths.

## A. Standard PROTEL revenue report

**Source file:** protel `HouseState_*.xlsx` — one row per business date (merged-cell grid) carrying free/occupied rooms, occupancy %, bed %, arrivals, departures, in-house, accommodation revenue, F&B, extras, total and average accommodation rate. Confirmed against the two Grande Roche samples.

What happens:

1. A new PROTEL parser reads each HouseState workbook, rebuilds the day grid, and turns every business date into normalised ledger rows the existing aggregation engine already understands (same trick used for OPERA's daily grid).
2. Room capacity per day is derived as free + occupied and cross-checked against the property's configured sellable rooms; a mismatch is logged as a run event rather than silently changing numbers.
3. Accommodation revenue drives OTB revenue and ADR; F&B and extras are carried as separate non-accommodation revenue so they never inflate ADR or occupancy.
4. Segment mix: HouseState carries no channel detail, so all nights land in a single "Direct" segment. If a Company/Travel-Agent Production export is also uploaded, it is used to split revenue and nights by agency/market code — otherwise the single segment stands.
5. The existing consolidated Excel builder and standard visual draft are reused as-is (OTB RR style), driven by the same snapshot rows.
6. "PROTEL" flips from planned to ready in the source registry, so the wizard, property settings and run review pick it up with no UI rewiring.

## B. CheetaPlains special reports

Enabled only for the CheetaPlains property (hard flag). A CheetaPlains run produces the normal PROTEL revenue report **plus** two extra report pages, each with its own parser and its own uploaded source files.

### Bookings by Nationality
- Source: `Nationality_Report_*.xlsx`. Sheet tabs map to financial years (`Current Year` = 2026/7, `Last Year` = 2025/6), each with month columns in March–February order and Quantity / Amount pairs, plus Confirmed / Provisional / Total blocks.
- Output: one row per country with villa nights and revenue for the current and prior financial year, sorted by current-year revenue descending, prior year read from the workbook's own `Last Year` tab.
- Layout: left-hand stacked title with bullet notes ("By Revenue", "Villa nights include complimentary stays"), terracotta header band, alternating blush/grey rows, right-aligned numbers with thousand separators, "OWNER'S REPORT <month year>" footer rule and property mark.

### Top Travel Booking Partners
- Source: `CompanyTravelAgentProduction_*.xlsx` (company/agent production rows: name, res. no., rate code, market code, distribution channel, room nights, accommodation, F&B, extras, total) and the reservations-by-agent workbook (`raw creation_*.xlsx` / manually updated consolidated version) for agent-level night and revenue subtotals.
- Output: two side-by-side ranked lists (current FY and prior FY), top 20 agencies each, with room nights and ZAR revenue; agency names normalised so the same partner ranks consistently across years.
- Layout: same terracotta/blush table styling, six columns (agency, RNS, revenue per year), stacked left-hand title with the year subtitle and the complimentary-stays note.

Both extra reports appear as additional draft pages/downloads on the run review screen alongside the normal revenue pack; missing source files leave the page unavailable rather than failing the run.

## Technical notes

- `src/lib/report-adapters/protel.ts`: implement the real adapter (status `ready`, expected columns for HouseState, accepted types `.xlsx`/`.xls`, `reportTemplate: "protel"`). Mirror in `supabase/functions/_shared/reportSourceAdapters.ts`.
- New shared parsing module `supabase/functions/_shared/protel/houseState.ts`: merged-cell-tolerant row reader, date parsing (`Sat, 01-08-2026`), numeric coercion, printed-total reconciliation, `protelDaysToLedger()` producing existing `LedgerRow` shape.
- New edge function `protel-report-parser` — same contract as the other parsers (`{ run_id, file_id? }` → `{ rows_parsed, months, files_parsed, files_pending, status }`), 100s time budget, per-file loop, run events for capacity mismatch and reconciliation gaps.
- New namespaced CheetaPlains modules: `supabase/functions/_shared/cheetaplains/nationality.ts` and `.../travelPartners.ts` for parsing; `supabase/functions/_shared/cheetaplains/specialReportHtml.ts` for the two A4-landscape HTML/PDF layouts (own palette constants, independent of the standard draft builder).
- New edge function `cheetaplains-special-reports` producing both special report payloads + HTML; results stored per run so the review page can re-render without re-parsing.
- DB: add a `report_special_reports` table (run_id, report_key, payload JSONB, html, status) with RLS gated by the existing `has_reports_access` helper and GRANTs, plus a `special_reports_enabled`/`cheetaplains` flag on `property_report_settings`.
- Frontend: extend `report_special_reports` types via regeneration, add a "Special reports" section to `ReportsRunReview.tsx` (visible only when the property is flagged), extend `reportUpload.ts` / `FileDropZone.tsx` with the CheetaPlains file roles (nationality, production, reservations).
- Aggregation, snapshot model, Excel builder, standard draft and AI insights are untouched; all new code lives under `protel/` and `cheetaplains/` namespaces.
- Docs: extend `docs/reference/Revenue-Reports-Source-Adapters.md` with PROTEL and the CheetaPlains special-report pipeline.

## Validation

- Parse both Grande Roche HouseState samples; reconcile monthly revenue, room nights, occupancy and ADR against the printed grid totals.
- Parse the CheetaPlains samples and check the generated tables against the two sample PDFs row by row (country and agency ordering, nights, revenue).
- Confirm a NightsBridge run and an OPERA run still process unchanged.
