# Reduce RU endpoint counter noise

## What I confirmed

The 24-hour counter is currently showing about 400 calls, including 55 throttled calls. The remaining expensive read traffic is not one single source.

Confirmed current code paths:

- Routine page-load readiness checks are local-only and call `property_readiness` with `probe_ari: false`.
- The LNM repull cron no longer pulls prices; it only pulls availability.
- `push-property-to-ru` has price and discount read-backs behind `verify_readback` / `verify_discount_readback` flags.
- A scheduled reconciliation function still refreshes readiness with `probe_ari: true` for up to 100 active listed properties after every reconciliation run. That can trigger live availability and price pulls when the stored ARI snapshot is stale.
- Account roster reads go through `ruRosterCache`, but Step A can still force a fresh roster read after account creation/binding.
- Account listing reads (`Pull_ListOwnerProp_RQ`) do not yet have a persistent per-owner cache. Reconciliation reads each monitored owner directly, and the helper has retry/confirm-empty behavior that can multiply calls when RU rate-limits or returns an empty account.
- Password-only verification still has a fallback path that can call `Pull_ListBuildings_RQ`; the recent log shows this exact path under `verify_child_login`. That is not useful as a password verdict.

## Fix plan

1. **Stop scheduled price read-backs from reconciliation**
   - Remove `probe_ari: true` from the post-reconciliation readiness refresh.
   - Keep reconciliation focused on account/listing parity only.
   - Leave live ARI read-back available only for onboarding Step B, certification, and explicit operator re-checks.

2. **Make daily ARI refresh push-only**
   - Explicitly pass `verify_readback: false` and `verify_discount_readback: false` from routine ARI cron paths.
   - Add a defensive request-scope object inside `push-property-to-ru` instead of module-level mutable flags so warm edge instances cannot leak a previous verified request into a routine request.

3. **Add a per-owner listing cache**
   - Cache `Pull_ListOwnerProp_RQ` results by `owner_id` for a short TTL.
   - Reconciliation should read each owner once per run and reuse that result for matching, stale-id checks, duplicate checks, and account summaries.
   - Manual “Reconcile now” can force refresh; normal UI loads and follow-up checks should prefer cached results.

4. **Remove retry loops that create throttled duplicates**
   - Replace the 20-second `Pull_ListOwnerProp_RQ` retry loop with a single attempt.
   - If RU rate-limits, record “queued/waiting” and let the next scheduled/manual pass resume instead of spending more calls inside the same minute.
   - Keep the “confirm empty account” safeguard, but only do the second read when the first successful result is empty and the account is being used for a destructive cleanup decision.

5. **Keep roster reads onboarding-only**
   - Keep the existing 10-minute roster cache.
   - Audit Step A so it performs at most one forced roster refresh after creating/adopting a sub-account, then reuses that answer.
   - All monitor panels should read cache-only unless the operator clicks refresh.

6. **Delete the password-only buildings probe**
   - `verify_child_login` should never use `Pull_ListBuildings_RQ` as a credential verdict.
   - Wrong password should return the guided Step A recovery state only: request the correct portal password and mint keys.

## Technical details

Likely files:

- `supabase/functions/cron-channel-reconcile/index.ts`
- `supabase/functions/cron-refresh-ru-ari/index.ts`
- `supabase/functions/push-property-to-ru/index.ts`
- `supabase/functions/channel-manager-entitlement/index.ts`
- `supabase/functions/rentalsunited-api/index.ts`
- `supabase/functions/ru-cert-portal/index.ts`
- A small backend migration if a persistent `ru_owner_listing_cache` table is needed.

No public/anonymous access changes are needed.

## Verification

After implementation:

- Confirm no routine `get_prices` calls appear after cron ARI refresh or channel reconciliation.
- Confirm `Pull_ListOwnerProp_RQ` is at most one call per owner per reconciliation pass, with throttles reported as waiting rather than retried every 20 seconds.
- Confirm `Pull_ListMyUsers_RQ` remains limited to Step A/manual refresh and cache misses.
- Confirm `verify_child_login` no longer emits `Pull_ListBuildings_RQ` failures.
- Re-check the 24-hour endpoint counter after the old window rolls over; the 55 throttles should decay instead of being replaced by new ones.
