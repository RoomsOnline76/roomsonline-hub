# Resilient NightsBridge ingestion

Make the NightsBridge source ingestor tolerant of layout and composition differences instead of expecting one fixed export shape, with a reviewer mapping step whenever a field can't be matched confidently.

## What changes for the user

1. **Any NightsBridge-ish export is accepted** — `.xlsx`, `.xls`, plus `.csv`/`.txt` delimited exports and text-layer PDF bookings summaries. Scanned (image-only) PDFs are still rejected with a clear message.
2. **Active field seeking.** The parser stops requiring exact header names. It scans every sheet and every plausible header row, scores candidate blocks, and matches each field by normalised header text, then by the shape of the data underneath (date columns, small integer counts, money columns, short text columns).
3. **Derived fields instead of failures.** Missing values are reconstructed where the data allows:
   - nights from arrival + departure/last night (or the reverse)
   - revenue from nett + commission, or accommodation + extras
   - last night from arrival + nights
   - currency defaulted to the property's currency
   - room name defaulted to a single-unit placeholder when the export has no room column
4. **Mapping panel when confidence is low.** If a required field can't be matched confidently, the file is marked "needs mapping" rather than failed. The run page shows the detected header row with a dropdown per field (with the parser's best guess preselected) and a preview of the first rows. Confirming re-parses that file. The confirmed mapping is saved per property so later runs with the same layout parse straight through.
5. **Honest per-file notes.** Each file reports which sheet/header row was used, how each field was resolved (matched header / inferred by data / derived / reviewer-mapped), rows parsed, rows skipped and why.

## Technical notes

- New shared module `supabase/functions/_shared/nightsbridgeLedgerParse.ts`: normalisation, alias table, header scoring, data-shape inference, block scoring, row extraction and derivation. `nightsbridge-report-parser/index.ts` becomes the I/O shell (download, dispatch by extension, write `report_source_files` status + snapshot) so the matcher is unit-testable.
- Extension dispatch: XLSX/XLS via existing SheetJS + `xlsxRepair`; CSV/TXT via delimiter sniffing (`,` `;` `\t` `|`) into the same grid shape; PDF via `unpdf` text extraction and baseline clustering, reusing the approach already proven in `_shared/operaHistoryForecast.ts`, producing the same grid.
- Field resolution returns `{ column, confidence, basis }` per field. Confidence tiers: exact alias, contains alias, token overlap, data-shape inference. Below threshold on a required field (arrival, nights, revenue, room) → status `needs_mapping` with the candidate headers returned to the client.
- `report_source_files` gains `parse_status` (`parsed` | `needs_mapping` | `failed`), `detected_mapping` jsonb and `applied_mapping` jsonb; migration includes GRANTs for `authenticated`/`service_role` and follows the table's existing RLS via `has_reports_access()`.
- `property_report_settings` gains `nightsbridge_column_map` jsonb — the last reviewer-confirmed mapping, applied automatically when a new file's header fingerprint matches.
- Function input extends to `{ run_id, file_id?, mapping? }`; passing `mapping` re-parses one file with the reviewer's columns and persists it.
- Frontend: `src/pages/reports/run-builder/StageParse.tsx` gains a `SourceFileMappingCard` (detected headers, per-field Select, sample rows, Re-parse action) driven from `src/hooks/useReportSnapshot.ts`; `src/lib/report-adapters/nightsbridge.ts` widens `acceptedFileTypes` and exposes the alias/field list so the UI labels match the parser.
- Existing well-formed exports must keep parsing byte-identically: verification runs the `docs/reference/nightsbridge/` sample pack plus the Aire Del Mar and Torburnlea files and compares month totals, room nights, ADR and occupancy against the current snapshots before the change is considered done.

## Out of scope

Prior/consolidated report ingestion (`report-prior-workbook-import`), OPERA and PROTEL adapters, and Excel/PDF output layout.
