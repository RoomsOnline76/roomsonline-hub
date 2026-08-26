# Archive the 21 locally-retired distribution accounts at the channel

## What is true today (verified)

- 21 accounts sit in the retired registry and **none** has `channel_archived_at` set — they are hidden in ROLOS only; the channel still holds their listings and keys.
- Only 8 of the 21 have stored API keys: 7 are flagged `key_scope = master_pair` (the bad `ROLOS-m` mints), 1 (`742091`) is `unverified`. The other 13 have no keys at all.
- The archive run (`purge_channel_account`) cannot complete for any of them:
  - master-pair keys are refused by the master-footprint guard (`RU_KEYS_ARE_MASTER_PAIR`) on `set_property_status`;
  - keyless accounts fail child auth (`RU_CHILD_AUTH_REQUIRED`) and fresh minting is refused by the channel (key creation not enabled at sub-account level).

So the current panel offers a button that can only fail. That is what this change fixes.

## What we build

### 1. Key match, shown per row
Each retired row in Channel Monitor → Advanced → Orphan / retired accounts gains a key badge derived from stored credentials:
`Child key` · `Master pair (unusable for child writes)` · `No keys`, plus the login email we hold. Operators see immediately why a row can or cannot be archived normally.

### 2. Archive-only escalation path (the actual unblock)
A retired, unbound account has no inventory worth protecting, so archival is allowed to run on **master credentials scoped by OwnerID** — the one place where master auth is legitimate, because it is removing footprint rather than creating it.

- Add an explicit, narrowly-scoped archive intent to the channel API: `set_property_status` may run on master credentials when the caller passes an `archive_retired: true` intent, the OwnerID is present in the retired registry, and the target status is archived/inactive. Every other write keeps the existing master-pair prohibition untouched.
- `purge_channel_account` uses that intent when (and only when) the account is in the registry and either has no usable child keys or holds a master pair. It records which envelope actually ran (`child_keys` / `master_scoped_archive`) in the step trail so nothing reads as a silent success.
- Listing enumeration already tolerates master reads with an OwnerID, so no change there.
- Master-pair credential rows are deleted after a clean archive (they are a liability, not an asset), and the registry stamps `channel_archived_at` only on a channel-confirmed clean run.

### 3. Batch runner for the 21
The existing "outstanding" section gets a run-all that processes accounts strictly one at a time, respects the RU rate-limit deferral (`rate_deferred` → wait and resume), and finishes with a per-account outcome list: archived count, refused listings, keys released. Refusals stay outstanding so a later pass retries them.

### 4. Leopard / master-account footprint
Listings pushed under master-pair keys landed in the master account, not the sub-account. Archiving the sub-account will not remove them. The run report calls these out separately as "listings found on the master account" (from the master roster read) so they can be archived deliberately in a follow-up — no automatic archival of anything on the master account.

## Technical notes

- `supabase/functions/rentalsunited-api/index.ts` — add the registry-verified `archive_retired` exemption alongside the master-pair guard (guard logic itself unchanged for all other actions).
- `supabase/functions/ru-cert-portal/index.ts` — `purge_channel_account`: credential triage (usable child key → master-scoped archive), pass the intent, report the envelope used, release master-pair key rows.
- `src/components/admin/channel-monitor/OrphanSubAccountsPanel.tsx` — key badges per row, batch runner with rate-limit backoff, richer per-row outcome.
- No schema change needed: `ru_retired_accounts.channel_archive_result` already stores the run trail.
