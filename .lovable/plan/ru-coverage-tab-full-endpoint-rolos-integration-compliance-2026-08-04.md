# RU Coverage tab: full endpoint + ROLOS integration compliance

Add a new **Coverage** tab to the Rentals United certification console that shows, in one place, every RU endpoint/action we implement, whether it last succeeded or failed, and how each one is wired into the ROLOS PMS (onboarding, ARI, reservations, leads, modifications, cancellations) — with two overall compliance counters and one-click JSON + PDF evidence export.

## What the tab shows

A single table grouped by RU architecture area:

- Account & auth (keys, sub-user scoping)
- Content / onboarding push (property, buildings, company, photos, amenities, composition)
- ARI (availability, prices, discounts)
- Reservations & leads (pull reservations, pull leads, lead hold lifecycle)
- Booking lifecycle (cancel, reject request, modify stay)
- Live notifications (RLNM handler, LNM subscriptions, change types, MCQ)

Each row carries:

| Column | Meaning |
|---|---|
| RU method | e.g. `Push_ModifyStay_RQ` |
| Direction | push / pull / refresh / webhook |
| RU adapter status | Implemented / Not implemented (from a static registry) |
| Last result | Green (passed) / Amber (partial or stale) / Red (failed) / Grey (never run) with timestamp |
| ROLOS surface | Where in ROLOS it is triggered — e.g. "Onboarding Phase 2 push", "Dashboard booking card → Cancel", "cron every 30 min" |
| ROLOS integration | Wired / Not wired, plus whether it has actually been exercised (success/fail/never used) |

Two headline counters at the top:

1. **RU adapter compliance** — implemented endpoints that last succeeded / total implemented endpoints.
2. **ROLOS integration compliance** — ROLOS-side surfaces that are wired *and* have a successful real run / total surfaces.

Both rendered as RAG progress bars, consistent with the existing Sync observability tab.

## Downloads

- **Download evidence (JSON)** — one comprehensive file: registry, per-endpoint last result, ROLOS wiring, both compliance scores, recent cert runs with steps, and recent sync-run log entries for the mapped actions.
- **Download status (PDF)** — generated client-side: header with account/date, the two compliance scores, the grouped table, and a failures/never-run appendix.

## Technical notes

**Backend — `supabase/functions/ru-cert-portal/index.ts`**
- Add a static `RU_ENDPOINT_REGISTRY` (extends the existing `CERT_MILESTONES` idea): RU method, area, direction, mandatory flag, `rolos_surface` label, `rolos_wired` flag, and the `ru_sync_runs` action keys plus cert-run method names that evidence it.
- Add action `coverage_matrix`: reuses the existing latest-cert-step map and `ru_sync_runs` latest-by-action map, applies a staleness window per area (ARI 24h, reservations 1h, content 168h — reuse `CADENCE_RULES` values) to grade amber, and returns rows + both compliance summaries.
- Add action `coverage_evidence`: same data plus the last N cert runs (with steps) and the matching raw sync-run rows, for the JSON download.
- Admin/dev/fearless_leader gated like the other actions.

**Logging gap to close**
`_shared/ruBookingSync.ts` currently invokes `cancel_reservation` / `reject_request` / `modify_stay` without writing to `ru_sync_runs`, so those rows can never turn green. Add a sync-run log write (action, success, error message, property/booking ref) in that helper so cancellations and modifications are evidenced.

**Frontend**
- New `src/components/integrations/RuCoverageTab.tsx` (table, counters, both download buttons).
- Register a `coverage` tab in `RuCertificationConsole.tsx` next to Runs / Milestones.
- PDF via a small client-side generator (add `jspdf` — not currently a dependency) with `jspdf-autotable` for the grouped table; JSON via a Blob download, matching the existing HyperGuest export pattern.
