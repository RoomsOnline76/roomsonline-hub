## Problem

Clicking **Pull latest suggestions** in ROLOS → PriceLabs shows `Pull failed: [object Object]`. The real error from PriceLabs never reaches the toast.

## Root cause

Two layers swallow the message:

1. `supabase/functions/pricelabs-api/index.ts` — `pullPriceSuggestions` returns `{ success: false, status, error: priced.body }` with a 200 HTTP status when PriceLabs itself rejects the call (401, 404, invalid listing_ids, etc.). `priced.body` is an **object**, not a string.
2. `src/pages/pms/PMSPriceLabs.tsx` — `callApi` only throws when `data.error` is truthy and passes it straight into `new Error(...)`. When `error` is an object it stringifies to `[object Object]`; when the response is `{ success: false, error: {...} }` (no top-level `error` string check for the object case) it also isn't handled uniformly. `apply_suggestions` has the same weakness.

Also `sync_property_to_pricelabs` returns `{ success: false, reason: "..." }` in several branches — the UI currently reports these as successes.

## Fix

Edge function `supabase/functions/pricelabs-api/index.ts`:
- In `pullPriceSuggestions`, `syncPropertyToPricelabs`, and `applySuggestions`, normalise failure returns to `{ success: false, status, error: <string> }`, stringifying upstream JSON bodies with `JSON.stringify` when they aren't already strings, and prefixing with the PriceLabs status (e.g. `PriceLabs 401: {"message":"Invalid API key"}`).
- In the action dispatcher, when the handler returns `success === false`, respond with HTTP `502` (upstream) or `400` (validation) so the client's `error` branch fires with a readable message, while still including the JSON body.

Frontend `src/pages/pms/PMSPriceLabs.tsx`:
- Rewrite `callApi` so it (a) reads `error.context?.response` from `FunctionsHttpError` to extract the JSON body, (b) treats `data.success === false` as a failure, (c) coerces any non-string `error`/`reason` to a string via `JSON.stringify`, and (d) throws a single `Error` with that string.
- Apply the same success/failure gate to `pushProperty` and `applySelected` so silent `success:false` responses stop looking like wins.

## Out of scope

No schema changes, no PriceLabs credential changes, no changes to the pull cadence or applied-price logic.

## Verify

After the fix, retriggering **Pull latest suggestions** on Dassiesingle should show the real PriceLabs error text (or a "no listings pushed yet" style message) instead of `[object Object]`, and the edge-function log will contain the same string.
