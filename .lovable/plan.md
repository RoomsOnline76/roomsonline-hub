# Close unbound sub-accounts from the Master account roster

Add a real "Close user account" action to Channel Monitor → Advanced → Master account
roster, offered only for roster entries that have **no ROLOS binding**, and run through
a strictly serialised queue that respects the channel's limits and the fact that a close
can take minutes.

## What the operator sees

- Each roster row that shows "No binding" and is not already archived at the channel
  gains a **Close account** action.
- A confirm dialog states plainly what the channel does on close: the login loses
  dashboard access, every sales-channel connection is removed, all its properties are
  archived, and the action is irreversible. The operator types the OwnerID to proceed and
  may add a reason.
- Multi-select: tick several unbound accounts and press **Close selected**. They are
  worked one at a time, never in parallel, with a visible queue: current account,
  elapsed time, cooldown countdown before the next one starts, and per-account outcome
  (closed / refused / needs keys / rate limited — will retry).
- Bound accounts keep no close action at all; the existing "Retire a bound sub-account"
  flow stays the only route for those (it disconnects the property first).
- After a successful close the roster re-reads, the account is written to the retired
  registry so every roster read, listing count, cost attribution and compliance sweep
  skips it, and the counters refresh.

## Honouring the channel's limits

Per the channel's API guidelines the close verb is authenticated **as the sub-account
itself** (no account selector in the request), it consumes a lot of platform resources,
may take several minutes, and a timeout should be retried with the same request. The
documented limits are concurrency-based, and there is no published inter-close interval,
so the run is deliberately conservative:

- One close in flight globally — a lock so two operators or two tabs cannot overlap.
- A fixed cooldown between closes (default 60s, shown as a countdown, adjustable in the
  panel between 30s and 5 min).
- Long request timeout with automatic same-request retries on timeout (up to 3), because
  the channel explicitly says a timeout does not mean failure.
- Rate-limit statuses (-5 concurrency, -6 sliding window) are treated as "retry later",
  not failure: the account is parked in the existing call queue with backoff and picked
  up again rather than hammered.
- A verification read after each close (roster read, retired entries included) confirms
  the account really is archived before it is marked closed.

## Prerequisite: the account's own keys

Because the close is authenticated as the sub-account, it needs that sub-account's own
child key pair. Rows where no child pair is held are shown as **Needs keys**, and the
run first tries the existing child-key mint for that login; if the channel refuses the
mint, the account is reported as "cannot be closed via API" with the reason, and never
attempted with master credentials — pushing or authenticating as the master account
stays forbidden.

## Technical notes

- `rentalsunited-api`: new `archive_user` action emitting `Push_ArchiveUser_RQ` with the
  child auth block (reusing `buildChildAuthXml`, as `list_child_api_keys` /
  `delete_child_api_key` already do), extended request timeout, retry-on-timeout, and
  status mapping for -5/-6 to a `RATE_LIMITED` outcome. Refuses outright when the
  resolved pair is a master pair or when the OwnerID has a live ROLOS binding.
- `ru-cert-portal`: new `close_unbound_account` action orchestrating one account —
  binding re-check, child-key resolve/mint, `archive_user` call, roster verification,
  retired-registry upsert, audit log entry — returning a per-step result array like
  `retire_owner_account` does.
- Serialisation and cooldown: an advisory lock plus a `ru_call_queue` entry per queued
  close, so parked/rate-limited closes resume without the browser staying open.
- `MasterRosterPanel.tsx`: row checkboxes for unbound rows, confirm dialog, sequential
  runner with cooldown countdown and per-row status, cooldown selector, and invalidation
  of the same queries archiving already refreshes.
- No schema change beyond the existing retired registry and call queue.
