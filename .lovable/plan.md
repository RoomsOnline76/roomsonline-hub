
## Problem

`supabase/functions/pricelabs-api/index.ts` is built against the wrong PriceLabs surface:

- **Base URL** is `https://api.pricelabs.co/v2/integration/api` — the Connector API is actually `https://api.pricelabs.co/v1`. That's why `/integration` returned nginx 404 and `/sync_status` slipped through to a different endpoint that demands `user_token`.
- **`set_integration`** currently POSTs to `/integration`. Per Swagger 2.0.0 the path is `/set_integration`.
- **`sync_status`** in the Connector API is `GET /sync_status?user_token=<CUSTOMER_KEY>`. The `user_token` is the per-customer PriceLabs API key (issued by PriceLabs to each hotel), distinct from our integration-level `X-Integration-Token`. It must be stored per property and sent as a query param.

## Fix

Edit only `supabase/functions/pricelabs-api/index.ts`:

1. Change `BASE` to `https://api.pricelabs.co/v1`.
2. In `set_integration` case: POST to `/set_integration` (keep body shape: `integration_name`, `sync_url`, `calendar_trigger_url`, `hook_url`, optional `regenerate_token`). Include `integration_name` in the body as the spec requires.
3. In `get_sync_status` case: read `user_token` from the request payload, fall back to `properties.pricelabs_config.credentials.user_token`. If missing, return a clear 400 telling the admin to paste the customer's PriceLabs user token first. Otherwise call `GET /sync_status?user_token=...`.
4. Add a lightweight `save_user_token` action that persists `user_token` into `pricelabs_config.credentials.user_token` for a given `property_id`, so admins can register the per-property token from the UI.
5. Frontend `PriceLabsCard.tsx`: add a small input for "PriceLabs customer user_token" plus a Save button wired to `save_user_token`, and pass `property_id` on `get_sync_status`. No other UI changes.

No DB migration needed — we reuse the existing `pricelabs_config` JSON column.

## Out of scope

- No changes to listing push, price pull, or apply-suggestion flows.
- No changes to webhook receiver.
