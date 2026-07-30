# Rentals United — Certification & White-Label Compliance Programme

Goal: an RU equivalent of the HyperGuest certification portal at `/admin/integrations/rentals-united`, where every mandatory RU endpoint can be exercised, evidenced, and re-run; refresh cadences proven compliant; discounts implemented and tested; and White-Label minimum-inventory readiness reported per property.

## Current state (verified)

- `rentalsunited-api` edge function already implements 28 actions, including `push_property`, `push_availability`, `push_prices`, `push_prices_fsp`, `subscribe_notifications` (LNM_PutHandlerUrl), `list_reservations`, `get_leads`, `push_long_stay_discounts`, `push_last_minute_discounts`, and their `get_*` verification counterparts, plus `create_user` / `list_users` / `fill_company_details`.
- `push-property-to-ru`, `ru-reservation-handler` (locked), `cron-push-all-properties-to-ru` (weekly content + RLNM refresh), `cron-refresh-ru-ari`, `cron-pull-ru-reservations` exist.
- `/admin/integrations/rentals-united` exists today as a **sync-run log viewer** (`ru_sync_runs` table, filters, manual triggers). It is not linked from the Integrations page and has no endpoint test harness or compliance scoring.
- Discount push actions exist in the API layer but have **no UI, no data source, and no test coverage**.

So: the plumbing is largely present; what's missing is verification, evidence, cadence proof, discount data/UI, and WL readiness reporting.

---

## Phase 1 — Endpoint inventory & test harness (foundation)

Scope
- New `ru-cert-portal` edge function modelled on `hyperguest-cert-portal`: runs an ordered suite of RU calls against the sandbox credential, records each step (name, request XML, response XML, RU status code, duration, pass/fail) to a new `ru_cert_runs` table.
- New DB table `ru_cert_runs` (+ per-step JSONB), with admin-only access rules.
- Rework `/admin/integrations/rentals-united` into a two-tab console: **Certification** (run suite, step list, XML request/response inspector, download evidence bundle as JSON) and **Sync Log** (the existing `ru_sync_runs` viewer, unchanged).
- Add an RU card/link on `/admin/integrations` so the page is reachable.

Suite covered in this phase (read/verify only, non-destructive): `health_check`, `list_properties`, `get_property`, `get_availability`, `get_prices`, `list_reservations`, `get_leads`, `list_buildings`, `list_composition_rooms`, `list_cities_and_currencies`, `get_location_by_coordinates`.

Exit criteria: every read endpoint returns RU status 0 (or a documented, explained non-zero) with captured XML evidence, on a repeatable one-click run.

## Phase 2 — Mandatory push endpoints + refresh cadence compliance

Scope
- Extend the suite with the four mandatory push methods against a nominated test property: `Push_PutProperty_RQ`, `Push_PutAvbUnits_RQ`, `Push_PutPrices_RQ`, `LNM_PutHandlerUrl_RQ`, each followed by its read-back verification call (push → get → diff).
- Assert RU's cadence rules and surface them as a **Refresh Compliance** panel:
  - Property content: on change + at least weekly.
  - Availability: on change + every 24h, 365 days forward, ≥1 available day.
  - Prices: on change + every 24h, 365 days forward, all prices > 0.
  - `Pull_ListReservations_RQ`: every 30 minutes alongside RLNM.
  - RLNM handler subscription: refreshed every 24h.
- Audit the existing cron schedules against those rules and correct any that don't comply (schedule changes only; the locked `ru-reservation-handler` file is not touched).
- Panel shows, per rule: required cadence, actual last-run timestamp from `ru_sync_runs`, next due, and a red/amber/green state.

Exit criteria: all four mandatory pushes pass with read-back verification, and every cadence rule shows green from real job history.

## Phase 3 — Discounts (Long stay + Last minute)

Scope
- Storage: new `ru_discounts` table holding per-property long-stay entries (nights threshold + % discount) and last-minute entries (days-before-arrival threshold + % discount), with validity dates and an active flag.
- UI: a **Discounts** section in the property's ROLOS channel/RU settings for authoring entries, with validation matching `validateDiscountEntry` (thresholds ascending, 0 < % < 100, no duplicates).
- Push: wire `push_long_stay_discounts` / `push_last_minute_discounts` into `push-property-to-ru` so discounts travel with the weekly content refresh and on save, logging to `ru_sync_runs`.
- Certification suite gains two steps: push discounts → read back via `get_long_stay_discounts` / `get_last_minute_discounts` → assert echo matches.

Exit criteria: discounts authored in ROLOS are visible in RU on read-back, and both discount steps pass in the cert run.

## Phase 4 — White-Label minimum inventory readiness

Scope
- Implement a per-property **WL Readiness** checker enforcing RU's minimum content requirements: name, ObjectTypeID, CanSleepMax ≥ 1, Floor, Space, Street + DetailedLocationID + ZipCode, latitude/longitude, ≥10 amenities, composition rooms present, room amenities with beds ≥ CanSleepMax, descriptions, ≥10 images at ≥1024×683 with a main photo set, ≥1 payment method, ≥1 cancellation policy, plus 365-day availability with ≥1 open day and 365-day pricing above 0.
- Surface it two ways: a portfolio-wide readiness table on the RU console (per-property score, blocking gaps) and an inline warning on the property's RU push panel that blocks/warns before pushing incomplete inventory.
- Reuse the existing image-size rule (≥1024×683) already enforced elsewhere in the project.

Exit criteria: the console lists every RU-enabled property with a pass/fail against all WL minimums and an actionable gap list.

## Phase 5 — User management (parked, scaffolded)

Scope
- Confirm the state of `create_user` / `list_users` / `fill_company_details` against RU's user-management docs, keep them behind an explicitly disabled flag, and show a "Pending RU PMS profile" status card on the console.
- No sub-user creation is enabled until RU confirms the PMS profile exists. Guest Communication API is explicitly **out of scope** for this whole programme.

Exit criteria: documented status + a one-switch path to enable once RU confirms.

---

## Technical notes

- All new RU calls go through the existing `rentalsunited-api` action router; no new direct XML callers.
- `.lovable/ADAPTER_LOCKS.md` locks `ru-reservation-handler` (full file) — Phases 1–5 do not modify it; any reservation-side change would be raised separately for approval.
- Evidence retention: cert runs keep raw request/response XML for download, which is what RU's certification reviewer will ask for.
- Snake_case on the wire, camelCase in TS; adapter response shape `{ success, data, error }` preserved.

## Suggested delivery order

Phase 1 → 2 → 3 → 4, with Phase 5 as a short closing task. Each phase ends with a green cert run so regressions are caught before the next phase starts.
