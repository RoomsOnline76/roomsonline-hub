# NightsBridge: zero-revenue rows, calculated Dinner / Room 0 / Comp nights

Two connected pieces of the NightsBridge adapter. The booking summary carries rows that are not real sold nights — blocks, maintenance, owner stays, unavailable rooms — and today they are filtered by hand, month by month, property by property. It also carries everything needed to work out Dinner, Room 0 revenue and Comp room nights, which are currently typed in by hand.

Note on the shared folder: the Google Drive link isn't reachable from here. Please attach the per-system sample files in chat (or drop them under `docs/reference/<system>/`) and I'll fold each adapter's real layout in as we work through them. This plan is built on the NightsBridge reference pack already in the repo, plus your description of Ashbourne House.

This plan supersedes the earlier choice to keep every zero-revenue night inside Room Nights: the default becomes exclude, with an explicit per-property keep-list for cases like Ashbourne's TOURVEST.

## 1. Zero-revenue rows

- **Default rule:** a booking with 0.00 revenue does not count towards Room Nights, ADR or Occupancy. Its nights and row count go to a "Blocked / non-revenue" bucket alongside the existing Room 0, Events and Holding-in-Credit buckets. Occupancy denominators (rooms x days) are untouched.
- **Per-property keep-list:** a property's report settings gain a list of text patterns that mean "this zero-revenue booking is a real occupied night". Ashbourne House gets `TOURVEST`. A row matches when the pattern appears in its guest name, company, source or room name, so it doesn't matter which column the label sits in.
- **Optional exclude-list** for the reverse case: labels that must always be dropped even when revenue is non-zero (e.g. an owner block booked at a token rate). Empty by default.
- Both lists are edited on the property's report settings page, with a short explanation and Ashbourne pre-seeded, and the run review page shows how many rows each rule caught this run.

## 2. Visibility on the run

The parse results panel gains a "Excluded rows" section, per month: how many rows and nights were dropped, grouped by reason (zero revenue, Room 0, Events, Holding in Credit, exclude-list), plus the kept-by-keep-list count. Every excluded row is listed with its date, room, guest/company and source so a reviewer can spot a mis-filtered booking instead of trusting a silent filter.

## 3. Calculated Dinner, Room 0 and Comp room nights

Per arrival month, from the export:

- **Dinner** — the total of the Extras column across every row, including Events and Room 0 rows.
- **Room 0** — revenue on rows whose room is `Room 0`. Verified against the reference pack: the August figure in the Torburnlea consolidated report (R5 187) equals exactly the Room 0 revenue in the matching booking summary.
- **Comp room nights** — nights on zero-revenue bookings in a sellable room, i.e. exactly the rows rule 1 excludes (Room 0 nights are not counted here, matching the reference workbook's own footnote). Keep-listed rows are real nights and are not comp.

These prefill the manual-inputs card, each labelled "calculated". Typing over one month marks that cell as an override: it survives re-processing and shows a revert-to-calculated action. Untouched months always follow the latest parse. The Excel workbook, draft report, KPI row and TOBI insight prompt read the resolved value (override, else calculated), so nothing downstream changes shape.

## Technical notes

- `_shared/nightsbridgeLedgerParse.ts`: add optional `guest_name` and `company` fields to `LedgerRow` with aliases (`guest name`, `guest`, `client`, `name`; `company`, `agent`, `account`). Neither is required, so no file can newly fall into "needs mapping".
- New `_shared/nightsbridgeRowRules.ts`: `classifyRow(row, { keepPatterns, excludePatterns })` returns `sellable | blocked_zero_revenue | room_zero | event | holding_credit | excluded_by_rule` plus the matched pattern. Case-insensitive substring match over guest/company/source/room.
- `_shared/nightsbridgeAggregate.ts`: `aggregateLedger(rows, roomCount, rules)` routes non-sellable classes into `non_sellable` keyed by reason (shape widens from one bucket to per-reason buckets, with the old total preserved), adds `excluded_rows` (per-month row detail, capped for payload size) and `derived_inputs { dinner_by_month, room0_by_month, comp_rns_by_month }`.
- Migration: `report_snapshots` gains `derived_inputs jsonb not null default '{}'` and `excluded_rows jsonb not null default '{}'`; `report_additional_inputs` gains `overrides jsonb not null default '{}'`; `property_report_settings` gains `zero_revenue_keep_patterns text[] not null default '{}'` and `row_exclude_patterns text[] not null default '{}'`. Existing tables, so no new GRANTs.
- New `_shared/reportAdditionalInputs.ts`: `resolveAdditionalInputs(derived, inputs)` merges derived values with reviewer overrides into the `AdditionalInputs` shape the workbook/HTML builders already take. `revenue-report-excel`, `revenue-report-draft` and `reports-xai-insights` call it instead of reading `report_additional_inputs` raw.
- `nightsbridge-report-parser` loads the property's pattern lists, passes them to the aggregator and writes the new snapshot blocks. OPERA and PROTEL parsers write empty blocks — their adapters are untouched this round.
- Frontend: `useReportSnapshot.ts` exposes `derivedInputs` and `excludedRows`; new `src/components/reports/ExcludedRowsCard.tsx` on `StageParse`; `ManualInputsCard.tsx` gains calculated/overridden states and revert; `ReportsPropertySettings.tsx` gains the keep/exclude pattern editors; `src/lib/report-adapters/nightsbridge.ts` marks the three monthly fields as auto-calculated. Strict types, semantic tokens, existing money/number formatters.
- Verification: reprocess the four `docs/reference/nightsbridge/source/bookingsummary*.xlsx` files at room count 7 and reconcile revenue, room nights, ADR, occupancy, Room 0 and Comp RNs against `31.07.26_Torburnlea Homestead-Revenue Report.xlsx`; then confirm on Ashbourne House that TOURVEST zero-revenue nights stay in Room Nights while blocks and maintenance drop out.

## Out of scope

OPERA and PROTEL adapter changes, prior/consolidated workbook ingestion, and report layout — each of those follows once its sample files are attached.
