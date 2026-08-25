# Fix noisy RU traffic failures

## What I confirmed

The failed traffic is not mainly coming from inactive properties.

Current 24-hour RU traffic failures are mostly caused by unnecessary or badly scoped operational reads:

- **Rate-limit failures:** repeated `Pull_ListOwnerProp_RQ`, `Pull_ListMyUsers_RQ`, and `Pull_ListPropertyPrices_RQ` calls hit the channel's one-call-per-minute window.
- **Notification subscription failure:** `push-property-to-ru` still has an optional `subscribe_rlnm` path that calls `subscribe_notifications` without `owner_id`, which now correctly fails because master fallback is prohibited.
- **Discount pull failures:** after pushing long-stay / last-minute discounts, the code verifies with `Pull_ListPropertyLongStayDiscounts_RQ` and `Pull_ListPropertyLastMinuteDiscounts_RQ`. RU returns “not implemented method”. Since ROL'OS is the source of truth, this read-back should not be part of production sync.
- **Cities/currencies failure:** `list_cities_and_currencies` was called once and RU rejected/disabled the dictionary endpoint. This should remain a manual/cache seeding capability, not a live property-sync dependency.
- **Incorrect password failures:** `Push_CreateApiKey_RQ` failures are legitimate Step A recovery prompts for wrong sub-user credentials, but `Pull_ListBuildings_RQ` is still appearing as part of credential verification traffic and should not be used as the password verdict.

The property-specific failed price reads were for an active/trading property (`Dassiesingel Self-catering Units`), so the immediate failure is not “calling inactive properties”; it is duplicate read-back/probe traffic and insufficient pacing.

## Fix plan

1. **Remove production discount read-backs**
   - Stop calling `get_long_stay_discounts` / `get_last_minute_discounts` after discount pushes in `push-property-to-ru`.
   - Keep the push result and local discount payload as the authoritative audit record.
   - Leave discount pull checks only in the certification console, and mark them optional/soft skipped when RU says the method is not implemented.

2. **Kill unscoped RLNM subscription calls**
   - Remove or hard-disable the `subscribe_rlnm` branch in `push-property-to-ru` that calls `subscribe_notifications` without `owner_id`.
   - Keep subscription refresh only in the dedicated daily RLNM/LNM job and property certification flow, both scoped to the account being configured.

3. **Gate LNM/RLNM subscriptions to operational accounts**
   - Change the daily notification refresh to use the existing operational gate so it only subscribes accounts with at least one connected property that has completed Step A/B and is not on hold.
   - Do not subscribe unkeyed, unbound, inactive, held, or not-yet-listed accounts.

4. **Reduce duplicate account/property reads**
   - Route account roster reads through the existing roster cache; do not fire `Pull_ListMyUsers_RQ` repeatedly from reconciliation/UI refresh paths.
   - Ensure `Pull_ListOwnerProp_RQ` calls use one shared cached result per owner during a reconciliation/certification run.
   - Keep explicit “force refresh” as an operator action only.

5. **Keep cities/currencies out of live sync**
   - Treat `list_cities_and_currencies` as a manual dictionary seed/diagnostic only.
   - If RU says the method is unavailable, record `endpoint_disabled` as a soft capability note, not a traffic failure.
   - Property location/currency changes should continue using stored LocationID/currency mappings and the property delta push.

6. **Fix credential recovery noise**
   - Ensure Step A password/key verification never uses `Pull_ListBuildings_RQ` as a password verdict.
   - Incorrect password from `Push_CreateApiKey_RQ` should surface only as the guided “reset/save correct password” prompt, not as a generic failed channel operation.

## Technical notes

- Main files to change:
  - `supabase/functions/push-property-to-ru/index.ts`
  - `supabase/functions/cron-ru-rlnm-refresh/index.ts`
  - `supabase/functions/ru-cert-portal/index.ts`
  - shared RU cache/scope helpers if needed
- Existing helper to use: `resolveRuOwnerScopes(..., { requireOperationalPush: true })` and `ownerIdsWithOperationalSync()`.
- No new tables are required.
- No anonymous access changes are required.

## Verification

After implementation:

- Re-check `ru_api_log` for the next 24h window and confirm no production `Pull_ListProperty*Discounts_RQ` calls appear.
- Confirm `subscribe_notifications` failures with `missing_owner_id` stop.
- Confirm daily LNM/RLNM refresh only touches operational owner IDs.
- Confirm city/currency dictionary failure is reported as disabled/soft, not a live-sync fault.
- Confirm incorrect Step A password opens the password recovery prompt and does not run a buildings read.
