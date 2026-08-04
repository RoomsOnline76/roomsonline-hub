# Rentals United: full LNM infrastructure + certification coverage

Today only one of the three LNM methods exists: `LNM_PutHandlerUrl_RQ` (reservation notifications, RLNM) — implemented as the `subscribe_notifications` action in the RU adapter, re-subscribed daily by the `ru-rlnm-daily` cron, and asserted as a mandatory certification milestone.

The two general Live Notification Mechanism methods are not implemented anywhere:
- `Push_PutLiveNotificationMechanismSubscriptions_RQ` (subscribe / update LNM)
- `Pull_ListLiveNotificationMechanismSubscriptions_RQ` (view current subscriptions)

This plan adds those two, wires them into the daily refresh cron, gives them a visible admin surface, and extends the certification suite so all three LNM methods are proven per account (master plus every white-label sub-user).

## What gets built

**1. Two new adapter actions**
- `put_lnm_subscriptions` — registers/updates the LNM subscriptions for the authenticated account against our handler URL.
- `list_lnm_subscriptions` — reads back what RU currently holds, so the console can show drift instead of assuming the push worked.

Both are account-scoped and must run under each account's own credentials (a master-auth call would subscribe our own account and leave the sub-user unmonitored) — the same strict child-auth rule already applied to `subscribe_notifications`.

**2. LNM notification handler**
A single endpoint receives LNM callbacks, logs every payload to `ru_sync_runs`, and acknowledges with RU's expected success envelope. Reservation notifications continue to go to the existing, locked `ru-reservation-handler`; the new endpoint handles the content/status notification types so we never touch the locked reservation path.

**3. Daily refresh, fanned out per account**
The existing `cron-ru-rlnm-refresh` job is extended so each account in the fan-out does three things in sequence, respecting RU's one-call-per-method-per-sliding-minute limit and the existing run budget: put handler URL, put LNM subscriptions, list LNM subscriptions (verification). Each step logs its own `ru_sync_runs` row so cadence tracking and the observability tab can grade them independently.

**4. Admin surface**
A "Live notifications (LNM)" panel on the Rentals United white-label sync page listing, per account (master + each sub-user): the registered handler URL, the subscriptions RU currently reports, last successful refresh, and any mismatch between what we push and what RU holds. Actions: re-subscribe this account, refresh all, and read back. Accounts without their own API keys are shown as unmonitored gaps rather than silently skipped.

**5. Certification coverage**
- Two new milestones alongside the existing "Subscribe RLNM handler": *Subscribe LNM* (mandatory) and *List LNM subscriptions* (mandatory read-back).
- Both added to the read-only/mandatory suite runs as account-scoped steps, using the per-method pacing already in place so they cannot trip rate limits.
- New cadence rules for LNM subscription freshness (24h), matching the RLNM rule, so the observability tracker turns amber/red when a refresh is missed.
- Where RU has not enabled a method for our integration, it is reported as "not tested — excluded" using the existing disabled-endpoint detection, not as a failure.

## Technical notes

- New XML builders and action handlers are additive in `supabase/functions/rentalsunited-api/index.ts`. No locked region (`buildPushPropertyXml`, child auth builders, `push_property`, `push_building`, `list_buildings`, `get_building`, `fill_company_details`) is touched; `ru-reservation-handler` is left untouched entirely.
- Both actions are added to `CHILD_SCOPED_ACTIONS` and `CHILD_AUTH_STRICT_ACTIONS`, and to the cert portal's `CERT_CHILD_SCOPED_ACTIONS` / `CERT_MASTER_FORBIDDEN_ACTIONS` and `ACTION_TO_RU_METHOD` maps.
- Account fan-out reuses `_shared/ruOwnerScopes.ts` (`resolveRuOwnerScopes`) with the new cadence action keys so staleness rotation keeps working.
- Exact request-body shape for `Push_PutLiveNotificationMechanismSubscriptions_RQ` (notification-type IDs and per-type URLs) is confirmed against the RU developer reference at implementation time; the raw response is persisted on every call so any schema rejection is diagnosable from the console rather than guessed at.
- No database schema change: subscription state is logged into the existing `ru_sync_runs` table and read back live from RU.
