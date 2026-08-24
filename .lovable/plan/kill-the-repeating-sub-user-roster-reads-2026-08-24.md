# Kill the repeating sub-user roster reads

## What I found (verified)

The roster cache that was built to make `Pull_ListMyUsers_RQ` a once-per-10-minutes read is **never able to save anything**:

- `ru_roster_cache` exists, has RLS on and one policy, but has **zero table privileges granted** — not even to `service_role`. Every write from the edge functions fails with a permission error, and the cache helper swallows that error in a `try/catch` warning.
- The table is empty (0 rows), confirming no write has ever landed.
- Because there is no cached row, **every** roster read falls through to the wire. 37 calls in the last hour, 93 in the last 24 hours.
- A throttled read (`RU_RATE_DEFERRED`) also writes nothing, so the next caller immediately tries again — that is the ~20-second cadence you are seeing, alternating `delivered` / `throttled`.
- The log rows all say `parent_action: rentalsunited-api:list_users`, so the calling surface is currently invisible in the traffic monitor — the roster helper's `roster:<source>` label is dropped before the log write.

Step A itself also asks for a fresh roster more than once per run (plan, conflict check, and two post-create re-reads), which is what produced the burst around the 22:42 `Push_CreateUser_RQ` in your screenshot.

## Fix

1. **Grant the cache table** (migration): `service_role` full access on `ru_roster_cache`; no `anon`/`authenticated` access. This alone stops the storm — the first successful read then serves the next 10 minutes.
2. **Make cache failures loud, not silent.** If the upsert fails, log an explicit error and mark the in-memory memo as authoritative for the TTL so a broken cache degrades to one read per instance instead of one read per call.
3. **Remember throttles.** When the wire read is rate-deferred and there is no cached row, record a short "do not retry before" stamp (about 90 seconds) and have callers return `deferred` from it instead of re-hitting the channel.
4. **Roster reads become onboarding-only.** Audit every `readRuRoster` caller: keep the wire read for Step A account creation/adoption and the nightly reconcile; every other surface (cert portal probes, entitlement scope reads, account manager panel load, endpoint probes) reads cache-only and reports the cache age instead of refreshing. The manual "Refresh roster" button stays as the only on-demand override.
5. **Collapse Step A to one fresh read.** Reuse the single post-create read for both verification passes instead of `listRuUsers(true)` twice.
6. **Attribute the traffic.** Pass the roster helper's `roster:<source>` through to `ru_api_log.parent_action` so the live traffic monitor shows which process asked, and the monitor can flag any non-onboarding roster read.

## Technical notes

- Files: `supabase/functions/_shared/ruRosterCache.ts` (grant-aware writes, deferral stamp, cache-only mode), `supabase/functions/ru-cert-portal/index.ts` (`listRuSubUsers`, Step A runners), `supabase/functions/channel-manager-entitlement/index.ts` (keep `forceFresh` for `reconcile` scope only), `supabase/functions/rentalsunited-api/index.ts` (honour incoming `parent_action` in the log write).
- One migration for the grants; no schema change.
- Verification: after deploy, confirm `ru_roster_cache` has a row with a fresh `fetched_at`, then confirm `Pull_ListMyUsers_RQ` count over a 15-minute window drops to zero while pages are browsed.
