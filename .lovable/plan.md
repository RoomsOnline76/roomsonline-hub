# Beds24 Adapter + Name Lookup

Mirror the HyperGuest pattern for Beds24 (API v2) and surface a "Search by name" picker on the property General tab for ROLOS and Beds24 properties.

## 1. Secrets (Lovable Cloud)

Request via `add_secret` (user must paste):
- `BEDS24_API_TOKEN` — long-life token from Beds24 → Account → API.
- `BEDS24_INVITE_CODE` (optional) — used once to mint a refresh token if the user prefers OAuth-style auth. Initial release will rely on the long-life token only.

Auth header for every call: `token: <BEDS24_API_TOKEN>`, base URL `https://beds24.com/api/v2`.

## 2. Edge function: `supabase/functions/beds24-api/index.ts`

Single function exposing actions, matching the HyperGuest shape (`{ action, propertyId, ... }`). Shared helpers (`b24Fetch` with gzip `Accept-Encoding`, redacted tracing, retry/backoff, Zod validation).

Initial actions:
- `health_check` — `GET /authentication/details`.
- `list_hotels` — `GET /properties` (paginated via `offset`). Apply the same African-country allow-list filter as HyperGuest, then fuzzy match by name. Returns `[{ id, name, city, country, score }]`.
- `list_rooms` — `GET /properties?includeAllRooms=true&id=<beds24PropId>`; normalize to ROLOS room shape.
- `get_ari` — `GET /inventory/rooms/calendar?roomId=...&startDate=...&endDate=...` → normalized availability + rates.
- `push_ari` — `POST /inventory/rooms/calendar` with batched day records (price1, numAvail, minStay, maxStay, multiplier).
- `sync_reflection` — pull static property data and write to `properties.external_metadata.beds24_reflection` (parity with HyperGuest reflection).
- Booking endpoints (`create_booking`, `cancel_booking`, `list_bookings`) — wired but flagged behind a follow-up cert pass; minimal stubs returning `not_implemented` so the UI surfaces capability gaps cleanly.

All responses go through the existing `isAdapterSuccess` / `unwrapAdapterResponse` envelope.

## 3. Frontend

### a. `src/components/property/Beds24PropertyLookup.tsx`
Copy of `HyperGuestPropertyLookup.tsx` calling `supabase.functions.invoke("beds24-api", { body: { action: "list_hotels", query } })`. Same dialog UX, debounce, Africa-only helper text, `onSelect(hotelId)` callback.

### b. `src/pages/PropertyForm.tsx` (General tab — PMS row)
- Add state `beds24PropertyId` / `existingBeds24PropertyId` mirroring the HyperGuest pair.
- Load from `external_system==='beds24'` → `external_id`, otherwise from `amenities.external_ids.beds24_property_id`.
- Save back into both places using the same branching used for HyperGuest.
- Render a new row directly under the HyperGuest row, gated on `selectedPMS in ['beds24','rolos','roomsonline']`:
  - `Label`: "Beds24 Property ID" (required only when `selectedPMS==='beds24'`).
  - `Input` + `<Beds24PropertyLookup propertyId propertyName currentPropertyId onSelect/>`.
  - Helper text: required for native Beds24, optional distribution link for ROLOS.

### c. `src/lib/pmsSystemsConfig.ts`
Promote the existing `beds24` entry from "planned" to active by adding capability flags (`channel_manager: true`, `ari_sync: true`, `bookings: false` for now). Add to `pmsFieldMappings.ts` if needed so the PMS selector renders it.

### d. `src/components/pms/channels/ChannelLogo.tsx`
Already has the `beds24` badge — no change.

## 4. Storage / schema

No migrations: reuse existing `properties.external_system` / `external_id` and the `amenities.external_ids` JSON bag (`beds24_property_id` key) — the same approach the HyperGuest lookup uses for ROLOS.

## 5. Verification

- Deploy `beds24-api`, hit `health_check` via `supabase--curl_edge_functions` once the token is set.
- Run `list_hotels` with `query="dass"` and confirm Africa filter + fuzzy match.
- Open Dassiesingel (ROLOS) → General tab → confirm the new "Beds24 Property ID" row + "Search by name" button appear under the HyperGuest row, persist on save, and reload correctly.

## Out of scope (follow-ups)

- Full booking create/cancel/modify against Beds24 (needs sandbox property + cert plan like HyperGuest).
- A Beds24 certification portal/runner — can mirror the HyperGuest portal later if Beds24 requires one.
