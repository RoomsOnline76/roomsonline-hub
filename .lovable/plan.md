# Calculated Dinner, Room 0 and Comp room nights (NightsBridge)

Today Dinner, Room 0 revenue and Comp room nights are typed in by hand on the run's manual-inputs card. The uploaded booking summary already carries everything needed to work them out, so the parser will calculate all three per month and prefill the card, leaving the reviewer free to override.

Confirmed against the reference pack: in the Torburnlea consolidated report the August Room 0 figure (R5 187) equals exactly the revenue on `Room 0` rows in the matching booking-summary export, and the workbook's own footnote reads "Comp RNs exclude Room 0 nights".

## What gets calculated, per arrival month

- **Dinner** — the total of the export's Extras column across every row, including Events and Room 0 rows, so no extras revenue is lost.
- **Room 0** — revenue on rows whose room is `Room 0`.
- **Comp room nights** — nights on zero-revenue bookings in a sellable room. These nights stay inside Room Nights, ADR and Occupancy exactly as they do now; the Comp RNs column is informational only. Room 0 and Events nights remain excluded from Room Nights, unchanged.

## Reviewer experience

- After processing files, the manual-inputs card shows the calculated Dinner / Room 0 / Comp values per month instead of blanks, each labelled "calculated".
- Typing over a month's value marks that single cell as an override: it keeps its value through re-processing and re-parsing, and shows an "Overridden" badge with a revert-to-calculated action.
- A month left untouched always follows the latest parse, so re-uploading a corrected export refreshes it.
- The Excel workbook, the draft report, the KPI row and the TOBI insight prompt all read the same resolved values (override where present, otherwise calculated), so nothing downstream changes shape.
- The report's notes footer keeps the existing wording and gains the reference pack's clarification that Comp RNs exclude Room 0 nights.

## Technical notes

- `supabase/functions/_shared/nightsbridgeAggregate.ts`: extend `AggregateResult` with `derived_inputs: { dinner_by_month, room0_by_month, comp_rns_by_month }`. Extras are accumulated per month for all rows (currently only a single `extras` total exists); Room 0 revenue is read from the existing non-sellable pass, keyed to `Room 0` only (Events and Holding-in-Credit stay in their own buckets); comp nights are counted for sellable rows with `revenue === 0` while still adding to `room_nights`.
- `report_snapshots` stores the derived block; migration adds a `derived_inputs jsonb not null default '{}'` column (no new table, so no new GRANTs needed).
- `report_additional_inputs` gains `overrides jsonb not null default '{}'` holding `{ dinner_by_month: { "2026-08": true }, ... }` — the flags for cells the reviewer has typed. The three existing `*_by_month` columns keep holding the reviewer values.
- New shared resolver `supabase/functions/_shared/reportAdditionalInputs.ts`: `resolveAdditionalInputs(snapshot.derived_inputs, additionalInputs)` merges derived + overrides into the exact `AdditionalInputs` shape the workbook/HTML builders already accept. `revenue-report-excel`, `revenue-report-draft` and `reports-xai-insights` call it instead of reading `report_additional_inputs` raw.
- The NightsBridge parser writes `derived_inputs` on snapshot upsert. OPERA and PROTEL parsers write an empty block, keeping their adapter behaviour (no Dinner / Room 0 columns) untouched.
- Frontend: `useReportSnapshot.ts` exposes `derivedInputs`; `src/components/reports/ManualInputsCard.tsx` seeds its draft from derived values, tracks per-cell override flags, renders "calculated" / "Overridden" states with a revert action, and saves overrides alongside the values. `src/lib/report-adapters/nightsbridge.ts` hints in the additional-field config that the three monthly fields are auto-calculated.
- Verification: process the four `docs/reference/nightsbridge/source/bookingsummary*.xlsx` files at room count 7 and compare the derived Room 0 figures and month room-night totals against `31.07.26_Torburnlea Homestead-Revenue Report.xlsx`, confirming room nights, ADR and occupancy are byte-identical to the current snapshot.
