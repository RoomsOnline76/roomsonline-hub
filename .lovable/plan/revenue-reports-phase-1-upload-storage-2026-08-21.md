# Revenue Reports — Phase 1: Upload & Storage

Builds on the Phase 0 shell (reports subdomain, role guard, dashboard, property list). This phase makes a run a real, persisted object: pick a property, set the as-of date, drop the NightsBridge `bookingsummary` files, and see the run appear in the dashboard list with its status and files. No parsing yet — that is Phase 2.

## What the user gets

**New Report wizard (`/new`)**
- Step 1 — Property: searchable list of active properties (reuses the Phase 0 list), source type shown as NightsBridge (only option for now).
- Step 2 — Details: as-of date picker (defaults to today), auto-generated editable title such as "Bi-Monthly Revenue Review – 14 Aug 2026".
- Step 3 — Files: drag-and-drop multi-file drop zone accepting `.xlsx`/`.xls`, per-file row showing name, size, upload progress, and a remove action. Duplicate files (same content) are flagged before upload.
- Create the run, upload the files, then land on the run page.

**Dashboard**
- "Recent runs" replaces the empty state with a real list: property logo and name, as-of date, status pill (draft / processing / ready / failed), file count, created date, and a link to the run.
- Empty state stays for a fresh install.

**Run page (`/runs/:runId`)**
- Header with property, as-of date, status pill.
- Source files card: filename, size, upload date, download link, and a placeholder "not parsed yet" indicator per file.
- Add more files / remove a file while the run is still `draft`.
- Process button present but disabled with a "Parsing arrives in Phase 2" note.
- Delete run (removes its storage objects too).

## Data & storage

New private storage bucket `revenue-reports`, objects laid out as `{property_id}/{run_id}/source/{uuid}-{filename}`.

New tables, both restricted to admin / dev / fearless_leader:

- `report_runs` — property, source type, as-of date, previous run reference, status, title, created_by, timestamps.
- `report_source_files` — run reference, storage path, original filename, byte size, file hash, parsed_ok, parse_errors, row_count, timestamps.

Access rules: only users holding admin, dev, or fearless_leader may view, create, edit or remove runs, their source files, and the stored files in the bucket. Nobody else — including property owners and staff — can reach any of it.

## Technical notes

- Migration: `CREATE TABLE` → `GRANT` (authenticated + service_role, no anon) → enable RLS → policies, per project convention. A shared predicate `public.has_reports_access(auth.uid())` (security definer, wraps `has_role` for `admin`/`dev`/`fearless_leader`) backs every policy on both tables and on `storage.objects` for the bucket. `updated_at` triggers via the existing `update_updated_at_column()`.
- Bucket created with the storage tool (private), then `storage.objects` policies in the migration scoped to `bucket_id = 'revenue-reports'`.
- `src/hooks/useReportRuns.ts` — list runs (with property join and file counts), fetch a single run with files, create run, delete run; TanStack Query with invalidation keyed `["reports","runs"]`.
- `src/lib/reportUpload.ts` — SHA-256 hash of each file via `crypto.subtle`, sequential upload with per-file progress callback, inserts `report_source_files` rows, rolls back the storage object if the row insert fails.
- `src/components/reports/FileDropZone.tsx` — native drag/drop (no new dependency), accept filter, size cap 20 MB per file, per-file status rows.
- `src/components/reports/RunStatusPill.tsx` — badge variants mapped from status.
- `src/pages/reports/ReportsNewRun.tsx` rewritten as the wizard (`useReducer` for step state per project standards); `ReportsRunReview.tsx` becomes the run detail page; `ReportsDashboard.tsx` recent-runs card wired to `useReportRuns`.
- Strict TS, no `any`; snake_case only at the DB/wire boundary.
