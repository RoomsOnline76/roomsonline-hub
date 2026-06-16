# HyperGuest Integration

## Endpoints (per `pms_tracker_status.additional_info.endpoints`)

| Purpose       | Base URL                                       |
| ------------- | ---------------------------------------------- |
| Static feed   | `https://hg-static.hyperguest.com`             |
| Search / ARI  | `https://search-api.hyperguest.io` (`/2.0/` preferred) |
| Booking       | `https://book-api.hyperguest.com/2.0`          |

## Secrets

| Secret name                  | Used for                          |
| ---------------------------- | --------------------------------- |
| `HYPERGUEST_AUTH_TOKEN`      | Sandbox bearer (default)          |
| `HYPERGUEST_AUTH_TOKEN_PROD` | Production bearer                 |

All HG calls send both `Authorization: Bearer <token>` and `X-Api-Key: <token>`.

## Mandatory pre-flight — static catalogue first

ARI calls (calendar + booking) **must not** run before the property's room and rate
catalogue has been cached locally. The edge function enforces this in
`ensureStaticCatalogue` (`supabase/functions/hyperguest-api/index.ts`):

1. Counts rows in `pms_room_types_cache` and `pms_rate_types_cache` for
   `(property_id, system_type='hyperguest')`.
2. If either is empty, or the newest `last_synced_at` is older than 24 h, it
   calls `fetchStaticData(creds, "all", …)` and upserts the catalogue.
3. If HG still returns nothing, the function responds with
   `{ success: false, error: { code: "STATIC_CATALOGUE_EMPTY", … } }` and HTTP
   **424 Failed Dependency**. UI surfaces this as a "Pull rooms & rates"
   CTA — never as a raw 4xx.

## Certification flow (`action: "run_certification"`)

10 steps executed against sandbox hotel `19912` unless `hotel_id` override is
provided:

1. `health_check` — `GET /hotels.json` on static host
2. `fetch_static_data` — calls `ensureStaticCatalogue` (cache or refresh)
3. `get_room_types` — asserts cache non-empty
4. `get_rate_types` — asserts cache non-empty
5. `fetch_availability` — `GET /2.0/hotels/{id}/availability?…` (camelCase
   first, snake_case fallback; legacy `POST /2.0/search` final fallback)
6. `prebook` — `POST /2.0/prebook`
7. `create_reservation`
8. `get_reservations`
9. `cancel_reservation`
10. `health_check_final`

A failure at step 2 or 5 with code `STATIC_CATALOGUE_EMPTY` exposes a "Pull
static data & retry" button in `HyperGuestCertificationRunner`.

## Calendar usage

`/admin/calendar` → `booking-orchestrator-api` → `hyperguest-api` with
`action: "fetch_availability"`. If the orchestrator receives the typed
`STATIC_CATALOGUE_EMPTY` error it must propagate it to the UI so the property
card renders the catalogue-pull CTA instead of a red error.
