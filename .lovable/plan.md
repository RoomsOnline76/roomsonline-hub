# Two health-report errors: what they actually are

## 1. `bind_ru_account · ×4 — "does not list OwnerID 742091"`

Nothing automated is binding. All four rows carry `details.source = "ru_console"`, i.e. an operator clicking **Bind** in the RU accounts panel: three clicks on OwnerID 742126 (24 Aug 10:25–10:27) and one on 742091 (24 Aug 17:09). Unbound properties are not attempting anything on their own.

The refusal itself was wrong. The bind verifies the OwnerID against the master sub-user roster in **cache-only** mode. When the cached roster is stale, the cache read still reports success, so a brand-new sub-account that exists at the channel but predates the snapshot reads as "absent" and the bind is hard-refused with 422. Evidence: one minute before the 742091 refusal, the notification handler was registered successfully **as OwnerID 742091**, and today's roster snapshot (25 Aug 03:10) contains both 742091 and 742126.

Changes:
- On a cache miss for the requested OwnerID, do one live roster read (`forceFresh`) before deciding. Only a fresh roster that lacks the OwnerID may refuse.
- If the live read is rate-deferred or fails, treat the OwnerID as *unverified*, not absent: bind the local pointer and flag it as unverified, exactly as the existing "list unavailable" branch already does.
- Refusal message names the roster age and offers "Refresh roster", instead of asserting the account does not exist.
- Health report: an operator bind refusal is account-reconciliation work, not a pipeline failure. Add `RU_OWNER_NOT_FOUND` / `bind_ru_account` refusals to the non-fault bucket so they appear under setup/account gaps rather than in "Top failures".

## 2. `PutHandlerUrl · ×1 · recovered — "Edge Function returned a non-2xx status code"`

Single row, master scope, 25 Aug 01:00; the same step succeeded on the next hourly pass and on every sub-account. The failure is real but the message is useless: the cron logs `error.message` from the invoke client, which is always that generic string, and never reads the response body carrying the channel's real reason.

Change: read the error response body in `cron-ru-rlnm-refresh` (same pattern as the front-end `extractFunctionError`) so the logged message carries the channel status/code. Rate-deferred answers get recorded as deferrals, not failures, so a one-off throttle stops surfacing as an unclassified error.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts` — `bind_ru_account`: replace the single `cacheOnly: true` roster read with cache-first + one `forceFresh` confirmation before any `RU_OWNER_NOT_FOUND`; keep the retired-account 409 guard ahead of it.
- `supabase/functions/cron-ru-rlnm-refresh/index.ts` — extract the invoke error body for the `PutHandlerUrl` step (and the LNM steps sharing the helper); classify `RU_RATE_DEFERRED` as deferred.
- `supabase/functions/daily-health-report/index.ts` — extend `isAccountConflict` (or add a sibling classifier) to cover `RU_OWNER_NOT_FOUND` and `bind_ru_account`.
- Deploy: `ru-cert-portal`, `cron-ru-rlnm-refresh`, `daily-health-report`.
- Verification: bind an account whose OwnerID is missing from the cached roster and confirm it now succeeds after a fresh roster read; confirm the next health report lists no `bind_ru_account` entry under Top failures.
