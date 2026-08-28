# NightsBridge adapter: verify Torburnlea, then refine

The zero-revenue filtering, calculated Dinner / Room 0 / Comp room nights and the excluded-rows review card are already built. This round is a reconciliation pass against the Torburnlea reference pack, followed by fixes for whatever the reconciliation exposes. No new behaviour is designed up front — the numbers decide.

## Step 1 — Reconcile against the reference pack

Reference material already in the repo:

- Source: Review all source marterial files in `docs/reference/nightsbridge/source/`
- Consolidated: `31.07.26_Torburnlea Homestead-Revenue Report.xlsx`
- Final: `31 Jul 26 _ Revenue Report _ Torburnlea Homestead.pdf`

Reprocess the four exports at room count 7 and compare, per month:


| Line                          | Compared against      |
| ----------------------------- | --------------------- |
| Accommodation revenue         | consolidated workbook |
| Room nights                   | consolidated workbook |
| ADR                           | consolidated workbook |
| Occupancy %                   | consolidated workbook |
| Dinner (calculated)           | consolidated workbook |
| Room 0 revenue (calculated)   | consolidated workbook |
| Comp room nights (calculated) | consolidated workbook |


Confirm the two exclusion rules explicitly: Room 0 nights and comp nights are absent from Room Nights, and comp nights are absent from the Room 0 count.

Any month that does not tie is written up with the offending rows named, so the cause is known before anything is changed.

## Step 2 — Fix what the reconciliation finds

Fixes stay inside the NightsBridge path: the ledger parser, the row classifier, the aggregator's derived block, or the resolver that merges calculated values with reviewer overrides. OPERA and PROTEL behaviour is untouched.

If a discrepancy turns out to be a real difference in the reference workbook's own method (rather than a bug), the report's notes footer records the method instead of the code being bent to match.

## Step 3 — Fold in the newly attached exports

Once you attach the per-property NightsBridge exports, each one is run through the same reconciliation and any layout differences (renamed columns, extra sheets, different date formats, missing room column) are absorbed by the parser's alias and inference tables — never by a per-property special case. Ashbourne House additionally confirms the zero-revenue keep-list: `TOURVEST` nights stay inside Room Nights while blocks, maintenance and owner stays drop out.

## Technical notes

- Reconciliation runs as a throwaway script under `/tmp` reading the four reference exports directly, printing a per-month table of parsed vs expected for every line above; it is not added to the project.
- Expected values are read out of the consolidated workbook rather than transcribed by hand, so the comparison cannot drift.
- Files touched only if a fix is needed: `supabase/functions/_shared/nightsbridgeLedgerParse.ts`, `nightsbridgeRowRules.ts`, `nightsbridgeAggregate.ts`, `reportAdditionalInputs.ts`, `nightsbridge-report-parser/index.ts`, and the review-stage components.
- Any parser change is re-verified with the same script before the work is called done.

## Out of scope

OPERA and PROTEL adapters, prior/consolidated workbook ingestion, and report layout.