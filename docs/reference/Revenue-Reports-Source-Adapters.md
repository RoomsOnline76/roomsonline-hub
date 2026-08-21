# Revenue Reports — Source Adapters (Phase 8)

Everything source-specific about a revenue report run lives behind one interface.
The aggregation engine, snapshot model, Excel builder, draft HTML and AI insights
are source agnostic and must stay that way.

## Where things live

| Concern | File |
| --- | --- |
| Adapter contract | `src/lib/report-adapters/types.ts` |
| Registry + helpers | `src/lib/report-adapters/index.ts` |
| NightsBridge (ready) | `src/lib/report-adapters/nightsbridge.ts` |
| OPERA (ready) | `src/lib/report-adapters/opera.ts` |
| PROTEL (planned) | `src/lib/report-adapters/protel.ts` |
| Server-side mirror | `supabase/functions/_shared/reportSourceAdapters.ts` |

`report_runs.source_type` stores the key per run; `property_report_settings.default_source_type`
preselects it in the New Run wizard.

## Extension points

1. **`parserFunction`** — the edge function that reads the uploaded files and writes
   `report_snapshots`. Every parser must accept `{ run_id, file_id? }` and return
   `{ rows_parsed, months, files_parsed, files_pending, status }`.
2. **`getExpectedColumns()`** — canonical lower-case column names the workbook must
   expose. Shown to the reviewer on the run page and used by the parser's header matcher.
3. **`acceptedFileTypes`** — drives the drop zone's `accept` filter in both the wizard
   and the run review page.
4. **`getDefaultAdditionalFields()`** — which manual monthly inputs and narrative
   blocks the reviewer is asked for.
5. **`reportTemplate`** — final visual layout (`standard`, or `protel` for the
   diverging PROTEL pack).
6. **`status`** — `planned` adapters appear in pickers but are disabled; processing
   fails fast with `unsupportedSourceMessage()` instead of invoking a missing function.

## Adding a new source

1. Add the key to `ReportSourceKey` in `types.ts`.
2. Create `src/lib/report-adapters/<source>.ts` implementing `ReportSourceAdapter`,
   starting with `status: "planned"` and a `notes` string describing what is outstanding.
3. Register it in `REPORT_ADAPTERS` in `index.ts` and mirror the descriptor in
   `supabase/functions/_shared/reportSourceAdapters.ts`.
4. Deploy the parser edge function, then flip `status` to `"ready"`.

No UI changes are needed — the wizard, property settings and run review page all read
the registry.

## OPERA

OPERA does not export a booking ledger. Its monthly extract is the **History and
Forecast** report (`history_forecast`), a PDF with one row per business date:

```text
Date      Total Arr.  Comp. House Deduct Non-Ded. Deduct Non-Ded. Occ.%  Room Revenue Average Rate
          Occ.  Rooms Rooms Use   Indiv. Indiv.   Group  Group
01-08-26  52    14    0     1      52    0        0      0        50.00% 80,375.60    1,545.68
```

Pipeline:

| Step | Where |
| --- | --- |
| PDF text extraction (`unpdf`) and visual line rebuilding | `supabase/functions/opera-report-parser/index.ts` |
| Grid parsing, Total-row reconciliation, ledger synthesis | `supabase/functions/_shared/operaHistoryForecast.ts` |
| Aggregation, snapshot, Excel, draft, insights | unchanged shared engine |

Notes:

- One PDF per month; upload as many months as the run covers. Scanned PDFs (no
  text layer) are rejected.
- Text items are clustered by baseline, not bucketed — a cell printed a fraction
  of a point off the row baseline would otherwise drop the whole day.
- Negative money is printed with the sign in its own cell (`- 4,769.53`) and is
  re-joined before parsing.
- Each day becomes ledger rows split into `Direct / Individual` and `Group` by
  that day's room-night split, with the last segment absorbing the rounding
  remainder so the month reproduces the printed total to the cent.
- Comp and house-use rooms become zero-revenue non-sellable rows and pre-fill the
  reviewer's complimentary room-night input; reviewer values always win.
- The daily rows are reconciled against the printed `Total` row for rooms and
  revenue; a mismatch fails the file rather than under-reporting.
- Because OPERA prints occupancy %, the sellable room count is implied by
  `rooms occupied / occupancy` and cross-checked against the configured count; a
  material difference is logged as a `capacity_mismatch` run event.

Verified against `docs/reference/opera/` (Cathedral Peak, 9 monthly extracts):
revenue, room nights, occupancy and ADR match the consolidated workbook for every
month.
