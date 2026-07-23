# PriceLabs pull failures — diagnose before fixing

## Why we're not touching push/pull payloads yet

The latest error is a **404 from PriceLabs** on every listing id: *"the listing_id you are trying to update does not exist or has not been added in PriceLabs"*. That is a different failure mode than the earlier 400s — PriceLabs is telling us the listings we're asking about aren't in their system at all. Any further guess at payload shape is likely to shift the error again without fixing the root cause.

We need to see PriceLabs' actual state for the affected property (Dassiesingle) before changing anything else.

## What this plan builds

A single read-only action added to `supabase/functions/pricelabs-api/index.ts`, plus a small "Debug" button in `src/pages/pms/PMSPriceLabs.tsx` behind the dev/admin gate.

### 1. Edge-function action: `debug_pricelabs`

New action handler that performs three read-only calls against PriceLabs for the current property and returns the raw responses side by side:

- `GET /listings` — full account listing dump (no filter), so we can see every listing PriceLabs has for our API key and what its `pms` value is.
- `GET /listings?listing_id=<one of ours>` — targeted lookup for the first room-type's expected `listing_id` (`rolos_<propertyId>_<roomTypeId>`). Confirms whether the ID our code generates matches anything on PriceLabs.
- Local snapshot: the `listings` payload our `buildListingsPayload` would send today (from `rolos_room_types`), so we can diff local ↔ remote in one glance.

The response is a JSON blob: `{ account_listings, matched_listing, local_payload, generated_ids }`. No writes, no side effects.

### 2. Frontend: "Diagnose PriceLabs" button

In `PMSPriceLabs.tsx`, next to the existing Push / Pull buttons, add a small **Diagnose** button (dev/admin-only, matches the existing `isDev || isFearlessLeader` gate). Clicking it:

- Calls the new `debug_pricelabs` action.
- Renders the JSON result inside a collapsible `<pre>` block on the page with a "Copy" button.
- Does not toast on failure — displays the raw error body inline so we can read PriceLabs' words verbatim.

### 3. What we will learn (and next-turn fix)

The debug output will tell us exactly one of:

- **PriceLabs has zero listings for us** → our `POST /listings` returns 200 but silently rejects everything. Next turn: parse the per-listing status in the `/listings` response, surface failures, and add whichever field PriceLabs is complaining about (likely `pms`).
- **PriceLabs has listings under different IDs** → our `listing_id` composition is wrong. Fix the ID scheme to match what PriceLabs stored.
- **Listings are there but under a different `pms`** → add `pms: <that value>` to both push and `get_prices`.

Only then do we edit push or pull. No blind payload changes this turn.

## Technical notes

- The three PriceLabs calls all use the existing `pl()` helper and the account's stored `X-API-Key` — no new secrets required.
- `debug_pricelabs` runs behind the same admin gate as `push`/`pull` on the client; the edge function itself still requires the caller to own the property (existing pattern).
- No DB migrations. No schema changes. No changes to `syncPropertyToPricelabs` or `pullPriceSuggestions` in this plan.
