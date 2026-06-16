## Problem (from edge logs)

`/admin/calendar` ARI fetch and `/admin-keys/hyperguest` Run Certification both die at the `fetch_availability` step:

```
GET https://search-api.hyperguest.io/hotels/19912/availability?check_in=... → 404 SN.404 Url not found
GET https://search-api.hyperguest.io/hotels/19912/availability?checkIn=...  → 404 SN.404 Url not found
POST https://api.hyperguest.com/hg-apitude/hotel-api/1.0/checkrates/        → 401 SN.401 Invalid authorization
```

Root causes:
1. `supabase/functions/hyperguest-api/index.ts` strips the `/2.0/` version prefix that HG's tracker config (`pms_tracker_status.additional_info.endpoints.search = https://search-api.hyperguest.io/2.0/`) declares as canonical. That is the most likely source of the 404s.
2. The legacy fallback uses a different auth scheme (`hg-apitude` API), which is why our Bearer token returns 401.
3. There is no guarantee the property's static room/rate catalogue has been pulled into `pms_room_types_cache` / `pms_rate_types_cache` before ARI is attempted — so even after fixing the URL, calendar callers have nothing to map availability rows against.

## Plan

### Step 1 — Confirm correct HG search-api contract (no code yet)
- Pull `pms_tracker_status.additional_info` for `hyperguest` to read the authoritative endpoint set (already shows `/2.0/`).
- Probe sandbox hotel `19912` directly from a one-off curl in the edge function logs panel:
  - `GET https://search-api.hyperguest.io/2.0/hotels/19912/availability?checkIn=…&checkOut=…&adults=2&rooms=1` with `Authorization: Bearer <HYPERGUEST_AUTH_TOKEN>`.
  - `POST https://search-api.hyperguest.io/2.0/search` with the `searchPayload`.
- Whichever returns 200 becomes the canonical call. Update `HG_ENDPOINTS.search` to include `/2.0/` and rewrite `fetchAvailability` to call only that path; remove the silent `hg-apitude/checkrates` fallback (it leaks 401 noise).

### Step 2 — Hard pre-flight: static catalogue must exist before ARI
In `supabase/functions/hyperguest-api/index.ts`:
- Add `ensureStaticCatalogue(supabase, creds, propertyId)`:
  1. Query `pms_room_types_cache` and `pms_rate_types_cache` for `(property_id, source = 'hyperguest')`.
  2. If either is empty **or** `last_synced_at` older than 24 h, call existing `fetchStaticData(creds, "all", supabase, propertyId)` and persist rows (the persistence path already exists for the cert flow — refactor so the same writer is used by both cert and runtime).
  3. Return `{ rooms, rates }` so callers can use the cached IDs.
- Wire this into:
  - `fetch_availability` action — call `ensureStaticCatalogue` first; if it returns 0 rooms, throw a typed `STATIC_CATALOGUE_EMPTY` error so the calendar surfaces "Pull rooms/rates first" instead of a generic 4xx.
  - `runCertification` — replace the inline `fetch_static_data` block with the same helper so the cert and runtime paths cannot diverge.

### Step 3 — Surface the requirement in admin UI
- `src/components/integrations/HyperGuestCertificationRunner.tsx`: when a step fails with `STATIC_CATALOGUE_EMPTY`, render an inline "Pull static data" button that calls `hyperguest-api` with `action: "fetch_static_data"` and re-runs certification.
- `src/components/pms/HyperGuestDetails.tsx`: add a "Static catalogue" status row showing room/rate counts and `last_synced_at` from the two cache tables, with a manual "Refresh" button. This is also what the calendar header should link to when ARI returns the typed error.
- `/admin/calendar` (existing HyperGuest property card): on `STATIC_CATALOGUE_EMPTY`, replace the red error with a CTA card "Pull rooms & rates from HyperGuest" → calls the same action and retries on success.

### Step 4 — Document the requirement
- Add `docs/hyperguest-integration.md` with: env tokens, endpoint set (from tracker), required pre-flight (static → ARI), and the cert flow's 10 steps. Link it from `HyperGuestCertificationRunner` help icon.

### Out of scope
- Touching `booking-orchestrator-api` or the public booking path. This change is admin/cert only; ARI orchestration already routes through the orchestrator and will simply benefit once `hyperguest-api` succeeds.
- Production token (`HYPERGUEST_AUTH_TOKEN_PROD`) work — sandbox cert must pass first.

### Technical notes
- Edge function file: `supabase/functions/hyperguest-api/index.ts` (1325 lines, no split needed).
- Caches: `pms_room_types_cache`, `pms_rate_types_cache` (existing columns already match HG normalized shape).
- Typed error contract: `{ success: false, error: { code: "STATIC_CATALOGUE_EMPTY", message, hint } }` — extend the existing zod-validated response envelope.
- No DB migration required.
