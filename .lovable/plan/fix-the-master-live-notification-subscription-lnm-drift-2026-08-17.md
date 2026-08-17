# Fix the master live-notification subscription (LNM drift)

## What the logs show

The two failing steps are both on the **master** account only — the sub-user scope
(`rooms@roomsonline.co.za`, OwnerID 741761) registers and reads back clean every run.

Confirmed from `ru_sync_runs`:

- `PutLnmSubscriptions` (master) is sent with `observed_owners = [742004, 741761]` and the
  channel answers **"Unexpected error, contact IT or try again"** — the whole request is rejected,
  so nothing is stored.
- `ListLnmSubscriptions` (master) then reads back `observed_owners = [741765]` and reports
  `drift — missing owners: 742004, 741761`. That is the *consequence* of the rejected push, not a
  separate fault. 741765 is a stale owner from an earlier bind that no longer exists locally.
- Account state: 742004 (`ru-owner@roomsonline.co.za`) has **no API keys captured** — it is an
  unprovisioned/retired sub-account. 741761 is the only fully provisioned one.

So one bad OwnerID in the list poisons the entire master subscription push, and the read-back
turns that into a red drift line every run.

## What will change

1. **Only observe monitored owners.** The master `observed_owners` list is built from accounts
   that are actually monitored (owner bound *and* keys captured), the same rule the channel
   reconciliation email already uses. 742004 drops out until its keys are captured.

2. **Isolate a rejected owner instead of losing the whole push.** If the channel rejects a
   multi-owner subscription push, retry once per owner (rate-limit paced, within the run budget),
   keep the owners that are accepted, and report the specific owner that was refused. A single bad
   owner can no longer block notifications for the good ones.

3. **Judge drift against what we intended to register.** The read-back compares against the
   accepted owner list, so a stale owner still held at the channel (741765) is reported as an
   informational extra rather than a failure, and missing owners name the account and the reason
   ("no API keys captured — capture them in Portfolios → RU accounts").

4. **No more UNKNOWN in the health report.** These steps get real error codes
   (`RU_LNM_OWNER_REJECTED`, `RU_LNM_OWNER_UNPROVISIONED`, `RU_LNM_DRIFT`) and unprovisioned-owner
   cases are classified as setup gaps (amber note), matching how other account-setup gaps are
   already treated.

## Technical notes

- `supabase/functions/cron-ru-rlnm-refresh/index.ts`: build `masterObservedOwners` from
  `ru_owner_accounts` joined to `ru_api_credentials` (plus the legacy key column) instead of every
  row with an OwnerID; add the per-owner retry fallback; pass the accepted list into
  `diffLnmSubscriptions`; log `error_code` on both steps.
- `supabase/functions/_shared/ruLnm.ts`: `diffLnmSubscriptions` also returns `extra_owners` so
  stale channel-side owners are visible without failing the step. Sub-user subscribes
  (`_shared/ruLnmSubscribe.ts`) already send a single owner and stay unchanged.
- `supabase/functions/daily-health-report/index.ts`: add the new codes to the setup-gap classifier
  so unprovisioned-owner cases land in Notes.
- Deploy the cron and health report, then run the refresh once and confirm the master step stores
  `[741761]` and the read-back is in sync.
