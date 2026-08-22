# Standalone reporting clients in Revenue Reports

Allow the revenue team to create a reporting-only client that does not exist in the ROL property list — a hotel or lodge Rooms Online only produces reports for. These records must be usable everywhere in Revenue Reports (runs, settings, branding, baselines, Excel/PDF) but must never appear in ROL property lists, the website, the PMS, or the Channel Manager.

## What the user gets

- A "New reporting client" button on the Revenue Reports dashboard, next to "New report".
- A short dialog: client name, city, country, sellable room count, and default report source (NightsBridge / OPERA / PROTEL / other adapters), with optional special report set.
- On save, the client appears in the reports property list with a small "Reporting only" badge, and immediately supports report settings (logo, cover, brand colours, historical baseline) and report runs like any ROL property.
- Reporting-only clients can be edited (name, city, country, room count) and archived from the reports Settings page for that client. Archiving hides them from the list without deleting past runs.

## How it works

Report runs and report settings are already keyed to a property record, so a reporting client is stored as a property record that is flagged and parked outside the ROL surface, rather than a parallel entity. This keeps every existing report feature working with no changes to the run pipeline, Excel builder or PDF renderer.

### Data changes (one migration)

- `properties`: add `is_reports_client boolean not null default false` and `reports_client_archived_at timestamptz null`.
- Reporting clients are inserted with `is_active = false`, `show_on_website = false`, `ru_push_enabled = false` and placeholder commercial fields (`price_per_night = 0`, `property_type = 'reporting_client'`). Because every ROL selector requires `is_active = true`, they cannot leak into property pickers, PMS, booking flows, the Channel Manager or the public site.
- New RLS policies on `properties`, scoped strictly to `is_reports_client = true`:
  - reports users (existing `has_reports_access()` check) may view, insert and update those rows only;
  - insert is additionally constrained by `with check (is_reports_client = true and is_active = false)` so this path cannot mint live ROL properties.
- `property_report_settings` row is created in the same action with the entered room count and default source; existing policies already cover it.

### Frontend changes

- `src/hooks/useReportProperties.ts`: run two queries — the current active/non-fixture ROL set, plus all `is_reports_client = true` rows with `reports_client_archived_at is null` (skipping the active filter and the test/sandbox name patterns, which do not apply to real client names). Return an `isReportsClient` flag and merge sorted by name. Room count for reporting clients comes from `property_report_settings.room_count` only, since they have no channel inventory.
- New `src/hooks/useReportsClients.ts`: `createClient`, `updateClient`, `archiveClient` mutations that write the property row plus its report settings and invalidate the `["reports","properties"]` query.
- New `src/components/reports/NewReportsClientDialog.tsx`: the create/edit form with validation (name required, room count >= 1) and Sonner toasts.
- `src/pages/reports/ReportsDashboard.tsx`: add the dialog trigger, the "Reporting only" badge on client cards, and a client count in the section heading.
- `src/pages/reports/ReportsPropertySettings.tsx`: for reporting clients, show an editable identity card (name, city, country, room count) and an archive action; keep the ROL-brand toggle hidden since there is no ROL brand to inherit — brand source is forced to `custom`.
- `src/hooks/useReportPropertyBrand.ts` / readiness checklist: treat a missing ROL brand as expected for reporting clients so the checklist does not flag it.

### Not in scope

No changes to parsers, Excel generation, PDF rendering, or any channel/PMS code path.
