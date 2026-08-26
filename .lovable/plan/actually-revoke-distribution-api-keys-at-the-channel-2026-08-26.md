# Actually revoke distribution API keys at the channel

## What is wrong

The purge/retire flow's "release keys" step only deletes **our stored copy** of the key pair (`ru_api_credentials`). It never asks the channel to delete the key, so the key pair still exists in the channel portal — which is why `test1@polka.co.za` (OwnerID 742573) reads "API keys released" while the channel still holds them.

Two further confirmed problems in the same step:

- For 742573 there was no stored key row at all, yet the delete of zero rows counted as success, so the panel claimed keys were released when nothing happened.
- The channel-side revoke verbs already exist in our channel API layer (list keys, delete key) but no caller uses them.

## What changes

1. **Real revoke at the channel.** During purge/retire, before dropping the local row:
   - enumerate the sub-account's key pairs at the channel,
   - delete each one at the channel,
   - only then delete the local row.
   Each attempt is recorded so refusals are visible instead of silently swallowed.

2. **Credential triage for the revoke.** Deleting a key must be authenticated as the sub-account. The step runs when we hold a proven child key pair, or when the operator supplies the portal password in the panel. When neither is available — or the only stored pair is a master pair — the step reports "cannot revoke at the channel: no sub-account credentials" rather than claiming success. Master pairs are never used to delete keys (they belong to the master account).

3. **Honest reporting.** The step's outcomes become explicit: `revoked at channel (n key(s))`, `nothing to revoke (channel lists no keys)`, `local copy removed only — channel revoke not possible`. The retired-account row stores the same detail, and the panel badge/summary text reflects it instead of the current blanket "API keys released".

4. **Re-run path for already-retired accounts.** The 742573-style rows (marked archived at channel, keys never revoked) can be re-run from Channel Monitor → Advanced so the key revoke happens on its own, without re-archiving listings.

5. **Copy fix.** "0 of 1 listing(s) archived" is misleading when the listing was archived on an earlier run — the line becomes "1 listing(s) already archived at the channel · nothing outstanding".

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`: add a `revokeChannelKeys(ownerId, childAuth)` helper invoking `rentalsunited-api` with `list_child_api_keys` then `delete_child_api_key` per `AccessKey`; call it from both `purge_channel_account` (step 4) and `retire_owner_account` before the `ru_api_credentials` delete. Record per-key results into `channel_archive_result.steps` and a new `keys_revoked_at_channel` boolean in the result payload.
- Local delete only proceeds after a successful channel revoke, or when the channel lists no keys; otherwise the row is kept and flagged, so a later run can retry.
- `src/components/admin/channel-monitor/OrphanSubAccountsPanel.tsx`: surface the new outcome states in the row summary and the bulk-runner toast; add a "Revoke keys at channel" action for retired rows whose `keys_revoked_at_channel` is not true.
- No schema change needed — the detail lives in the existing `channel_archive_result` JSON; only its shape grows.
