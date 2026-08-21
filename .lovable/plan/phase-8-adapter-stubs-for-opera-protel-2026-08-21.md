# Phase 8 — Adapter stubs for OPERA / PROTEL

Goal: make the Revenue Reports pipeline source-aware end to end, so OPERA and PROTEL parsers can be dropped in later without touching the UI, aggregation engine, Excel builder or draft report. No new parsing logic is written in this phase — the two new adapters are registered stubs that fail cleanly with an explanatory message.

## What changes for the user

- The "New run" wizard gains a **Report source** selector: NightsBridge (ready), OPERA (coming soon), PROTEL (coming soon). Non-ready sources are visible but disabled, with a short note on what is still needed.
- The property's report settings page lets you set the **default source** for that property; new runs preselect it.
- A run's review page shows a proper source label (currently it prints the raw `nightsbridge` string) plus the expected columns for that source, so a mismatched upload is obvious.
- If a run somehow carries a not-yet-supported source, processing stops with a clear "OPERA parsing is not available yet" message instead of a generic failure.

## Technical design

### Adapter registry (frontend)
New `src/lib/report-adapters/`:
- `types.ts` — the brief's contract, typed for our data model:
  ```ts
  interface ReportSourceAdapter {
    key: "nightsbridge" | "opera" | "protel";
    label: string;
    status: "ready" | "planned";
    parserFunction: string;          // edge function name
    reportTemplate: "standard" | "protel";
    acceptedFileTypes: string[];
    getExpectedColumns(): string[];
    getDefaultAdditionalFields(): AdditionalFieldConfig;
    notes?: string;                  // shown in UI for planned sources
  }
  ```
- `nightsbridge.ts` — describes the existing behaviour: `parserFunction: "nightsbridge-report-parser"`, expected columns lifted from the parser's `COLUMN_ALIASES`/`REQUIRED`, current additional-input defaults.
- `opera.ts`, `protel.ts` — `status: "planned"`, `parserFunction` pointing at the future `opera-report-parser` / `protel-report-parser`, PROTEL flagged `reportTemplate: "protel"`, expected columns left as a documented best guess from `docs/reference/opera|protel` samples, `getExpectedColumns()`/`getDefaultAdditionalFields()` returning empty/default with a `notes` string.
- `index.ts` — `REPORT_ADAPTERS` map, `getAdapter(key)`, `listAdapters()`, `isSourceReady(key)`.

### Wiring
- `src/hooks/useReportSnapshot.ts` — replace the hardcoded `invoke("nightsbridge-report-parser")` with `getAdapter(run.sourceType).parserFunction`, and refuse (toast + no call) when `status !== "ready"`.
- `src/hooks/useReportRuns.ts` — keep `nightsbridge` as fallback but validate `sourceType` against the registry.
- `src/pages/reports/ReportsNewRun.tsx` — add the source selector (from `listAdapters()`), default to the property's `default_source_type`, pass it into `createRun`, and use the adapter's `acceptedFileTypes` for the drop zone.
- `src/pages/reports/ReportsRunReview.tsx` — render `adapter.label` instead of the raw key; show expected columns in the source-file section.
- `src/pages/reports/ReportsPropertySettings.tsx` — expose the default-source select (column `default_source_type` already exists); planned sources selectable so a property can be pre-marked, with a warning that runs cannot process yet.

### Backend
- No migration needed: `report_runs.source_type` and `property_report_settings.default_source_type` already exist as text.
- Add `supabase/functions/_shared/reportSourceAdapters.ts` mirroring the registry (keys, labels, readiness) so parser functions and `revenue-report-draft` / `revenue-report-excel` can branch on source and template without duplicating strings.
- `revenue-report-draft` reads `reportTemplate` and keeps using the standard layout; the PROTEL divergence is left as a single documented switch point.
- No new edge functions are deployed in this phase.

### Documentation
`docs/reference/revenue-reports-adapters.md`: the adapter contract, the exact list of extension points (registry entry, edge parser, normalised ledger shape expected by `_shared/nightsbridgeAggregate.ts`, additional-input defaults, report template hook), a step-by-step "adding OPERA" checklist, and pointers to the sample files under `docs/reference/opera` and `docs/reference/protel`.
