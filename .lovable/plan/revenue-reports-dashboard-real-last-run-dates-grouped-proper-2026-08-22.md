# Revenue Reports dashboard: real last-run dates + grouped property list

The property cards currently render a hardcoded `Last run: —` badge — no last-run data is fetched at all. Fix that, then reorder the grid.

## What changes

1. **Last run date per property**
   - Fetch the latest run per property (property id, as-of date, status) alongside the property list, covering every eligible property (not just the few in "Recent runs").
   - Card badge shows `Last run: 20 Aug 2026` when one exists, and stays `Last run: —` when the property has never had a run.

2. **Grouped property list**
   - Section 1 — **With reports**: properties that have at least one run, alphabetical.
   - Visible section break (heading + divider) between the two groups.
   - Section 2 — **No reports yet**: alphabetical.
   - Search behaviour is unchanged: it still filters across all properties; groups simply reflect the filtered set, and an empty group is hidden.

## Technical notes

- `src/hooks/useReportProperties.ts`: add a grouped query over `report_runs` (max `as_of_date` per `property_id`, restricted to the eligible property ids already computed there) and expose `lastRunDate: string | null` plus `lastRunId` on `ReportProperty`. Sorting inside the hook stays alphabetical.
- `src/pages/reports/ReportsDashboard.tsx`: split `properties` into `withRuns` / `withoutRuns` via `useMemo`, render two labelled grids, and use the existing `formatRunDate` helper in the badge.
- No schema or edge-function changes.
