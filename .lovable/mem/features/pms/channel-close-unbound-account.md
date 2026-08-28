---
name: Close unbound distribution sub-accounts
description: Master roster close action — child-only auth, unbound-only, one at a time with a 30s-5m cooldown
type: feature
---

Closing a distribution sub-account at the channel (`Push_ArchiveUser_RQ`, "close user account") is
run from Channel Monitor → Advanced → Master account roster, on rows with **No binding** that are
not already archived.

Rules that must hold:

- **The verb has no account selector** — whoever authenticates is the account that gets closed.
  It may therefore only run with a proven CHILD key pair (or the sub-account's own portal login).
  A master pair is refused outright: it would close our own master account.
- **Unbound only.** `close_unbound_account` refuses any OwnerID still present in
  `ru_owner_accounts` — retire the binding first (that flow archives listings and disconnects).
- **Strict serialisation.** One close in flight platform-wide, held as a `running` row on
  `ru_call_queue` with `action = 'ru_close_account'`; a stale lock is released after 15 minutes.
  A configurable gap (default 60s, clamped 30s–5m) is enforced after each completed close.
- **Timeouts are not failures.** The channel says a close may take minutes and a timeout should be
  retried with the identical request — the API action retries up to 3 times before reporting.
  Statuses -5/-6 map to a `RATE_LIMITED` outcome that leaves the account open for a later retry.
- **Verify, then retire.** After the close, the roster is re-read; the account is upserted into
  `ru_retired_accounts` (with `channel_archived_at` only when confirmed) and its stored key row is
  deleted, since the close destroys the channel-side keys.
- When keys cannot be minted, the account is reported as "cannot be closed via API" — never
  escalated to master credentials for the close.
