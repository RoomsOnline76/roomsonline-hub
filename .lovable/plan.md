
# HyperGuest Connectivity — Full Go-Live Plan

Goal: take the existing `hyperguest-api` adapter from "code complete" to "selling rooms on Booking.com/Expedia/Trip.com via HyperGuest from 1–2 real ROL'OS properties", with a repeatable pattern for the rest of the portfolio.

---

## Phase 1 — Schema & per-property mapping

1. **Migration** — add HyperGuest binding columns on `public.properties`:
   - `hyperguest_hotel_id text` (the HG hotel ID, e.g. `19912` for cert)
   - `hyperguest_environment text default 'sandbox'` (`sandbox` | `production`)
   - `hyperguest_enabled boolean default false`
   - `hyperguest_last_static_sync_at timestamptz`
   - `hyperguest_last_push_at timestamptz`
   - Partial index on `(hyperguest_enabled) where hyperguest_enabled = true`.
2. **PropertyForm — PMS / Channels tab**: add a "HyperGuest" sub-card (mirrors the Hostfully card pattern):
   - Inputs: hotel ID, environment toggle, enabled switch.
   - Inline "Test connection" button → calls `hyperguest-api` `health_check` scoped to this hotel ID.
   - Read-only: last static sync / last push timestamps.
3. **Adapter contract change** — `hyperguest-api` accepts optional `hotel_id` + `environment` per request; falls back to property record, then to `CERTIFICATION_HOTEL_ID` only when no property context is provided.

---

## Phase 2 — Certification harness (hotel 19912)

New admin page section under **Admin → API Keys → HyperGuest**: a "Certification Runner" that executes the HG mandatory test sequence and shows pass/fail per step + raw JSON.

Sequence (against `19912`, sandbox token already in `HYPERGUEST_AUTH_TOKEN`):

```text
1. health_check
2. fetch_static_data         → assert hotel + room types + rate plans returned
3. get_room_types            → cached into pms_room_types_cache (system_type='hyperguest')
4. get_rate_types            → cached into pms_rate_types_cache
5. fetch_availability        → next 30 days, 2 adults
6. prebook                   → cheapest available combination
7. create_reservation        → using prebook token, test guest
8. get_reservations          → confirm appears
9. cancel_reservation        → confirm cancelled
10. health_check (final)
```

- Each step logged to `integration_logs` (table already exists) with `integration_type='hyperguest'`, status, duration_ms, payload hash.
- Results surfaced in the existing `HyperGuestDetails` capability grid, switching from "declared" to "verified" checkmarks once a step has a green run within 30 days.

---

## Phase 3 — Outbound content & rate push pipeline

This is where the *value-for-ROL'OS* lives: properties without their own channel manager get OTA distribution for free.

1. **Static content push** (`hyperguest-api` `push_static_data` — new action):
   - Source: `properties` (name, descriptions, geo, policies, amenities), `rolos_room_types` (room editorial + images), `rolos_rate_plans`.
   - Mapping: ROL'OS canonical → HG static schema (room category, max occupancy, bedding, amenities ISO codes, images ≥ 1024×683).
   - Trigger: manual button on PropertyForm + nightly cron if `hyperguest_enabled = true` and content changed since `hyperguest_last_static_sync_at`.
2. **Rates & availability push** (`push_ari` — new action):
   - Pulls daily rates from `rolos_inventory_calendar` + `rolos_rate_prices` for the next 365 days.
   - Sends BAR + (optional) net rates, restrictions (min/max stay, CTA/CTD, closeout) per HG spec.
   - Hooks: trigger on `rolos_rate_prices` and `rolos_inventory_calendar` row changes (existing `sync-rates-availability` pattern) → enqueue delta push.
3. **Inbound reservations** (`pull_reservations` cron):
   - Every 10 min, call `get_reservations` for all enabled properties (delta since `hyperguest_last_pull_at`).
   - Create/update rows in `bookings` with `source='hyperguest'` and OTA channel (Booking.com / Expedia / etc.) extracted from HG payload.
   - Auto-assign units via existing multi-unit round-robin logic.
4. **Orchestrator integration**: `booking-orchestrator-api` must route HG-managed properties through HG for live availability when `hyperguest_enabled = true` (still honouring `NO_BOOKING_FROM_CACHE` at checkout).

---

## Phase 4 — Pilot rollout (1–2 properties)

1. Pick two `is_active = true` Sleep in Africa properties (recommend: one small/manual-PMS, one larger with Benson) — confirm with you which two.
2. Bind each to the HG sandbox hotel (or to their real HG hotel ID if HG has provisioned one). Run the certification harness scoped to those IDs.
3. Push static content + 90-day ARI window.
4. Connect Booking.com sandbox via HG, place a test booking on Booking.com → verify it lands in `bookings`, deducts inventory across all channels, and confirmation email fires.
5. Test cancel + (when HG-side modify is enabled) modify flows.
6. Sign-off → flip `hyperguest_environment = 'production'`, repeat smoke tests on prod token, go live.

---

## Phase 5 — Operator UX & monitoring

- **PMS Control Hub** card (existing dashboard): HG row showing per-property health, last sync, last booking ingested, error count last 24 h.
- **Alerts**: push to `system_alerts` on consecutive `prebook` or `create_reservation` failures (>3 in 1 h).
- **Capability matrix** in `HyperGuestDetails`: switch each capability from "declared" → "verified" (with last-tested timestamp) so an admin can see at a glance what's been exercised against a real hotel.

---

## Technical details

- Auth: existing `HYPERGUEST_AUTH_TOKEN` secret. Production hotels may need a different token — plan to allow per-property `hyperguest_auth_token_secret_name` override later (out of scope for v1).
- Endpoints unchanged: `hg-static`, `search-api 2.0`, `book-api 2.0`. Booking timeout already set to 300 s.
- Wire format: `snake_case` outbound + Zod `safeParseResponse` on every HG reply (per API validation policy).
- Mapping tables to reuse: `pms_mappings` (rate code ↔ rolos_rate_plan), `pms_room_types_cache` (HG room ↔ rolos_room_type), `hostfully_unit_map` pattern for unit-level mapping where applicable.
- Modify-booking is HG-side disabled today; we'll expose the capability but gate the UI behind the `supports_modify_booking` flag returned by `get_capabilities`.

---

## Deliverables checklist

- [ ] Migration: `properties.hyperguest_*` columns + partial index
- [ ] PropertyForm HyperGuest sub-card with test/save
- [ ] `hyperguest-api`: hotel-id scoping + new actions `push_static_data`, `push_ari`, `pull_reservations`
- [ ] Admin certification runner UI + logging into `integration_logs`
- [ ] Cron jobs: nightly static push (changed only), 10-min reservation pull, ARI delta push on rate/inventory change
- [ ] Booking orchestrator routing for HG-enabled properties
- [ ] PMS Control Hub HG row + `system_alerts` hooks
- [ ] Capability matrix "verified" badges
- [ ] Pilot sign-off doc for the 2 chosen properties

---

## Out of scope (v1)

- HG-side modify booking (not supported by HG today)
- Per-property HG token override (single workspace token for v1)
- HG webhook receiver (HG is PULL today — only revisit if HG enables push for our account)
