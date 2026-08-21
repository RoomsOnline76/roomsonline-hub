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
| OPERA (planned) | `src/lib/report-adapters/opera.ts` |
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
