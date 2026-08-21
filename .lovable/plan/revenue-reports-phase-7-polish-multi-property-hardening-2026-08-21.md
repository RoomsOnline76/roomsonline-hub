# Revenue Reports — Phase 7: Polish & Multi-Property Hardening

Brief section 12, Phase 7. Four workstreams: settings UI, error handling / re-processing / audit trail, large-file performance, and in-app documentation.

## 1. Property report settings UI

The settings page today is a single long form. Restructure it into a clear, scannable page:

- Group into named sections: Capacity & branding (existing), Report defaults (fin-year start, currency, bi-monthly cadence), Historical baseline, Notes & disclaimers.
- Show a small "readiness" summary at the top: capacity set, baseline present, branding resolved — each with a tick or a fix link, so a new property can be prepared without guesswork.
- Add a property switcher on the settings page so an operator can move between properties without going back to the dashboard.
- Dirty-state guard: warn before navigating away with unsaved changes; disable Save when nothing changed.

## 2. Error handling, re-processing and audit trail

- **Per-file error surfacing:** the review screen lists each source file with its parsed row count and, when it failed, the recorded parse errors in an expandable block (currently stored but not shown in full).
- **Retry paths:** "Re-parse this file" (single file) and "Re-process run" (all files). Re-processing clears the previous snapshot rows for the run before writing new ones so numbers can never be double-counted, and it is blocked while a run is already processing.
- **Failed run recovery:** a failed run shows the failure reason inline plus the two retry buttons, instead of only a red pill.
- **Audit trail:** new `report_run_events` table recording every state change (created, files uploaded/removed, processing started, processing succeeded/failed, excel generated, draft generated, insights generated, notes edited, run deleted) with actor, timestamp and a small JSON detail payload. Written by the edge functions (service role) and by the client for user-driven edits. Displayed as a timeline card on the run review screen.
- Confirmation dialogs on the destructive actions (delete run, delete file, re-process a completed run).

## 3. Performance with large bookingsummary files

- Stream-friendly parsing: process each workbook one at a time and release it before the next, aggregating into month buckets rather than holding all rows in memory; drop the full row array from the response payload.
- Batch the snapshot writes (chunked upserts) instead of one statement per month/room-type.
- Guard rails: reject files above a configured size ceiling at upload time with a clear message, and cap files per run per the brief (~10).
- Time budget: the parser returns a partial result with a clear "processed N of M files" status if it approaches the function time limit, so a big run degrades instead of timing out.
- Progress feedback: the review screen polls run status while processing and shows which file is being handled.

## 4. Documentation / in-app help

- Expand the Help page: full run lifecycle, what each status means, how variance vs previous snapshot and vs last year is derived, occupancy/ADR formulas, what to do when a file fails to parse, file naming and size expectations, and branding/capacity setup.
- Add contextual help: short inline hints on the upload step, the manual inputs card and the baseline card, each linking to the matching Help section anchor.
- Add a maintainer note in `docs/reference/` describing the run pipeline (upload → parse → snapshot → excel → draft → insights) and the extension points Phase 8 will use for OPERA/PROTEL adapters.

## Technical notes

- New table `public.report_run_events` (run_id FK cascade, event_type text, actor_id uuid, detail jsonb, created_at) with GRANTs for `authenticated` (select/insert) and `service_role` (all), RLS enabled and policies gated on `public.has_reports_access(auth.uid())` — same pattern as the existing report tables.
- Files touched: `src/pages/reports/ReportsPropertySettings.tsx`, `ReportsRunReview.tsx`, `ReportsHelp.tsx`; new components `RunEventTimeline.tsx`, `SourceFileList.tsx`, `ReadinessChecklist.tsx`; new hook `useReportRunEvents.ts`; `src/lib/reportUpload.ts` for size/count limits.
- Edge functions updated: `nightsbridge-report-parser` (single-file re-parse mode, snapshot clearing, batched writes, time budget, event logging), `revenue-report-excel`, `revenue-report-draft`, `reports-xai-insights` (event logging only).
- No change to snapshot maths, Excel layout or draft rendering — Phase 7 is hardening around them.
