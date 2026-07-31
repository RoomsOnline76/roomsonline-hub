# 🔒 PMS Adapter Locks

The files and functions below are **locked**. Any change to them requires an
explicit, in-message go-ahead from the user in the same conversation turn that
ships the change. Do NOT modify them as a "drive-by" cleanup, refactor, or
side-effect of another feature.

Regressions of these regions have caused live availability/booking drift for
production properties. Ship-first-fix-later is not acceptable here.

## Locked regions

| Adapter | File | Locked functions / regions |
|---|---|---|
| Hostfully | `supabase/functions/hostfully-api/index.ts` | `handleFetchAvailability`, `fetchHostfullyUnitTypeInventory`, `mapHostfullyCalendarToAvailability`, `extractHostfullyLeads`, `DEAD_STATUSES` set |
| Rentals United | `supabase/functions/ru-reservation-handler/index.ts` | full file |
| Rentals United | `supabase/functions/rentalsunited-api/index.ts` | `buildPushPropertyXml`, child authentication builders, `push_property`, `push_building`, `list_buildings`, `get_building`, `fill_company_details` |
| Rentals United | `supabase/functions/push-property-to-ru/index.ts` | OwnerID resolution/phase-gate block and `inventory_push` evidence writes |
| NightsBridge | `supabase/functions/nightsbridge-reservations-sync/index.ts` | full file |
| Booking orchestrator | `supabase/functions/booking-orchestrator-api/index.ts` | ARI resolution + `NO_BOOKING_FROM_CACHE` enforcement |
| Beds24 | `supabase/functions/beds24-api/index.ts` | `handleFetchAvailability`, `handleFetchRates` |

## Invariants (must hold across all PMS adapters)

1. **Availability must come from the PMS's authoritative inventory surface**,
   not from a computed sum of leaf/child calendars. If the PMS exposes a
   Rooms-to-Sell / unit-type / room-type inventory endpoint, it is the source
   of truth.
   - Hostfully multi-room properties are not allowed to cache summed
     `/property-calendar` child totals when v3.1/v3.3 unit-type inventory is
     unavailable or not exposed for the credential; fail loudly instead.
2. **Never silently fall back to a less-authoritative surface** — log a
   warning, cache with the correct authority marker, and surface the
   degradation upstream.
3. **Snake_case on the wire, camelCase in TS** — do not flip either side.
4. **Never bypass live PMS verification for a booking** (`NO_BOOKING_FROM_CACHE`).
5. **Preserve adapter contract response shape** (`{ success, data, error }`).
6. **RU white-label writes must target the linked sub-user** — never default a
   missing OwnerID to the master account, and never retry child-authenticated
   company/building operations with master credentials.

## Change procedure

1. Confirm the user asked for this specific adapter change in the current turn.
2. Post the diff scope BEFORE touching code (files + function names).
3. Ship the smallest change that satisfies the request.
4. Update this file if the lock scope changes.
5. Re-deploy the affected edge function(s) and verify against a real property.

_Last updated: 2026-07-31 (Rentals United sub-user isolation and inventory evidence gates)._


## 🔒 Rentals United — child (sub-user) isolation

`Push_FillCompanyDetails_RQ`, `Push_PutBuilding_RQ`, `Pull_ListBuildings_RQ` and `Pull_GetBuilding_RQ`
have **no `<OwnerID>` element** in the RU schema: RU applies the write to whichever identity
authenticates. Therefore:

- These actions MUST authenticate with the child `UserName`/`Password` envelope.
- NEVER add a parent `AccessKey`/`SecretKey` fallback — it silently writes to our **master**
  company profile / building list, which breaks white-label isolation.
- If the child login returns Status `-4` (Incorrect login or password), surface the error.
  RU API Support must enable API login for child accounts (verified 2026-07-31: even a
  freshly created sub-user with a known password is rejected on the XML surface).
