# Child keys: mint as the sub-account, and generate on demand from the roster

## What is wrong today

The shared mint helper in `ru-cert-portal` (`mintChildKeyPair`) tries, in order:

1. an existing stored pair (plus one retry),
2. a **master-authenticated** mint carrying `<OwnerID>` (`owner_scoped_mint`),
3. only then the sub-account's own login/password envelope — and only when a password
   was supplied for that run.

So for an account with no stored pair, the first real attempt is a master-account call.
That is the wrong identity: keys minted that way come back as master pairs, which are
then flagged "Master pair (unusable)" and cannot authenticate the close verb.

## Change 1 — the sub-account mints its own key

Reorder the cascade so the child identity is always tried first and the master is not
used to mint child keys at all:

1. `child_password` — the sub-account's own login email + password (the run's password,
   otherwise the standard operator password we set on ROLOS-created accounts).
2. `child_credential` — an existing stored pair, for rotation on accounts that hold one.
3. one short-delayed repeat of whichever envelope was available, for transport blips.

The `master_owner_scoped` variant is removed from the cascade. When every child envelope
is refused, the result stays the honest "the channel will not mint a key for this login"
outcome with the attempt trail, instead of silently producing a master pair. The existing
master-credential **archival** escalation (archiving listings for accounts whose keys are
gone) is a separate path and is untouched.

Rate-limit deferral, retry countdown and the attempt trail behave exactly as now.

## Change 2 — "Generate key" on the Master account roster

Every roster row that shows **No key**, **Key held — unverified**, or **Master pair
(unusable)** gains a **Generate key** action.

Pressing it runs, for that one account:

1. Mint via the child envelope (login email from the roster row + operator password).
2. **Verify** the returned pair actually authenticates as that OwnerID
   (`verify_child_key_owner`) — a pair that can enumerate the roster is a master pair and
   is rejected, never stored.
3. **Test** it with a read under that pair.
4. **Store** it against the sub-account in `ru_api_credentials` (`ru_owner_id`,
   `login_email`, `access_key`, `secret_enc`, label, `verified_at`), replacing any
   unusable master pair on that row. A pair already filed on a different OwnerID is
   refused as a duplicate rather than overwritten.

Results appear per row: minted and verified (with the AccessKey's last 4), refused by the
channel (with the reason), master pair rejected, duplicate, or rate limited — retry.
Selecting several rows runs them one at a time with the same pacing the rematch runner
uses, so the channel's limits are respected.

Once a row shows a verified child key, the existing **Close account** action can proceed —
the close is authenticated as the sub-account, so this is exactly the prerequisite it was
missing.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`
  - `mintChildKeyPair`: variant ordering as above; drop `master_owner_scoped`; keep
    per-variant key labels so the duplicate-request gate does not mask refusals.
  - New action `generate_child_key` ({ `ru_owner_id`, optional `login_email`, optional
    `password`, optional `key_label` }) → mint, `verify_child_key_owner`, store, return
    `{ status, access_key_last4, owner_id, message }` with statuses
    `minted` | `refused` | `master_pair` | `duplicate` | `rate_limited`.
- `supabase/functions/rentalsunited-api/index.ts`: no wire change needed —
  `create_child_api_key` already supports the password envelope and the ordered
  `Authentication → Label → Scope` payload. The `owner_scoped_mint` branch stays in place
  but is no longer called by the cascade.
- `src/components/admin/channel-monitor/MasterRosterPanel.tsx`: per-row Generate key
  button, multi-select sequential runner with paced calls, per-row outcome badges,
  refresh of the stored-key read on completion.
- Secrets never leave the edge function; only the AccessKey's last 4 is surfaced.
- Deploy `ru-cert-portal` and verify against one unbound roster account: key generated,
  verified, stored, then a close attempt reaches the channel instead of "Needs keys".
- Memory update: child key minting is child-authenticated only; the master account is
  never used to mint a sub-account key.
