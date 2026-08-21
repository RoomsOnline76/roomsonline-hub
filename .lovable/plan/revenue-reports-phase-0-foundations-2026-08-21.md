# Revenue Reports — Phase 0 (Foundations)

Stand up the `reports.roomsonline.co.za` shell only: hostname mount, role guard, empty dashboard, and a property list read from the existing properties table. No new tables, no uploads, no parsing, no AI in this phase.

## What the user gets

- Visiting `reports.roomsonline.co.za` lands in a dedicated Reports app shell — never the main admin or booking UI.
- Signed-out visitors are sent to the existing sign-in screen; after login they return to Reports.
- Only admin, dev and fearless_leader can see anything; everyone else gets a clear "no access" screen instead of a bounce loop.
- Shell contains: top bar (ROL logo, user menu), left nav (Dashboard, New Report, Property Settings, Help), and routes for Dashboard plus placeholders.
- Dashboard shows an empty-state card ("No report runs yet") plus a searchable property list — logo, name, room count where known, and a "Last run: —" placeholder. Each card links to `/settings/:propertyId` (placeholder page in this phase).

## Technical notes

Hostname detection
- Add `REPORTS_DOMAIN` + `isReportsDomain` to `src/lib/config.ts`, matching the existing `isConnectDomain` pattern.
- Add `reports.roomsonline.co.za` to `ADMIN_HOSTS` in `src/lib/guestDomain.ts` so the host is never treated as a guest booking host.
- In `src/App.tsx`, mount a `reports` branch alongside the Connect mount: when `isReportsDomain`, render only the Reports route tree (`/`, `/new`, `/runs/:runId`, `/settings/:propertyId`, `/help`, `*`), leaving `/auth` reachable. Keep the existing non-reports tree untouched.

Layout and guard
- `src/components/layout/ReportsLayout.tsx` — top bar + left nav + `<Outlet />`, wrapped in a new `ReportsRouteGuard` that uses `useAuth()` (`isAdmin || isDev || isFearlessLeader`), renders a skeleton while `loading`, redirects to `/auth` when unauthenticated, and shows an access-denied panel for authenticated non-privileged users.
- Reuse existing shadcn primitives and semantic tokens; analytics/board-report feel (generous whitespace, restrained accents), consistent with the Connect portal.

Pages (new, under `src/pages/reports/`)
- `ReportsDashboard.tsx` — empty runs state + property list.
- `ReportsNewRun.tsx`, `ReportsRunReview.tsx`, `ReportsPropertySettings.tsx`, `ReportsHelp.tsx` — Phase 0 placeholders stating which phase delivers them.
- `src/hooks/useReportProperties.ts` — react-query read of `properties` (`id, name, slug, logo_url`-style fields, filtered `is_active: true`), ordered by name, with client-side search.
- Route entries lazy-loaded via `React.lazy`, matching current App.tsx conventions.

Head metadata
- Set a Reports-specific title/description via the existing `usePageSEO` hook on the dashboard, with `noindex` for this private subdomain.

## Out of scope for Phase 0

`report_runs` / `report_source_files` / `report_snapshots` / `property_report_settings` tables, the `revenue-reports` storage bucket, the NightsBridge parser, Excel and PDF generation, and xAI insights — those land in Phases 1–6.
