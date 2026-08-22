# Split Reports Dashboard and Settings

Right now `/settings` renders the exact same component as the dashboard, so both pages look identical. This separates them.

## Dashboard (`/`)

- Keeps the "Revenue Reports" header, New report / New reporting client actions, and Recent runs.
- Properties section shows only properties that already have at least one run. The "No reports yet" group is removed entirely (those properties live on Settings).
- Search still filters the listed (with-report) properties.
- If no property has a run yet, show a short empty note pointing to Settings.

## Settings (`/settings`)

New standalone page, no Recent runs and no "Revenue Reports" report section:

- Heading "Reporting settings" with a short subtitle.
- Searchable grid of all properties (with and without reports), each card linking to that property's report settings page — the existing card layout, badges included.
- Keeps the "New reporting client" action so standalone reporting clients can be added from here.

## Technical notes

- Extract the property card into `src/components/reports/ReportPropertyCard.tsx` so both pages share it.
- New `src/pages/reports/ReportsSettings.tsx`; route `settings` (both the subdomain block and the `/reports` block in `src/App.tsx`) points at it instead of `ReportsDashboard`.
- `ReportsDashboard.tsx` drops the `withoutRuns` group and renders only `withRuns`.
- No database or backend changes.
