---
name: RU coverage & compliance tab
description: Rentals United certification console Coverage tab — endpoint registry, RAG status, dual compliance counters, JSON/PDF evidence export
type: feature
---

The RU certification console (`/admin/integrations/rentals-united`) has a **Coverage** tab
(`src/components/integrations/RuCoverageTab.tsx`) backed by two `ru-cert-portal` actions:
`coverage_matrix` and `coverage_evidence`.

`RU_ENDPOINT_REGISTRY` in `supabase/functions/ru-cert-portal/index.ts` is the single source of
truth: every RU method carries its area, direction, mandatory flag, cadence window, the ROL'OS
surface + onboarding/booking stream it serves, `rolos_wired`, and `sync_actions` (the
`ru_sync_runs.action` values that evidence real product usage).

Status resolution per endpoint:
1. Latest matching step across `ru_cert_runs.steps` (source `cert_run`).
2. Latest matching `ru_sync_runs` row wins when newer (source `sync_log`).
3. RAG: green = passed and within `max_age_hours`, amber = passed but stale, red = failed,
   grey = never run. Endpoints RU has not enabled stay excluded/informational.
4. ROL'OS usage column: real `ru_sync_runs` evidence, or — for console-driven surfaces flagged
   `rolos_via_cert` — the certification-run result itself.

Two compliance counters: **RU adapter** (implemented endpoints passing) and **ROL'OS integration**
(wired surfaces actually exercised). Exports: full JSON evidence bundle (registry + summary + cert
runs + sync log + cadence rules) and a landscape PDF status report via `jspdf`/`jspdf-autotable`.

Booking lifecycle evidence depends on `logRuSyncRun` in `supabase/functions/_shared/ruBookingSync.ts`,
which records `cancel_reservation`, `reject_request` and `modify_stay` runs — keep that logging in
place or the lifecycle rows regress to "never used".
