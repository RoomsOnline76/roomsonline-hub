# Rematch stored child key pairs against the master roster

Every key pair we still hold is checked against the live master account roster, so each
pair ends up attached to the sub-account it actually authenticates as — or is plainly
labelled as a master pair / orphan that cannot be used.

## What we hold today

Four stored pairs remain: one proven child pair, one never verified, and two proven
master pairs (which must never be used for sub-account writes).

## What the operator gets

A **Rematch stored keys** action in Channel Monitor → Advanced → Master account roster,
next to the roster read:

- It reads the roster (retired entries included) and every stored key pair.
- Each pair is probed to find its true owner:
  - roster enumeration probe first — a pair that can list the roster is a **master pair**
    and is marked as such, never rematched onto a sub-account;
  - otherwise the pair is tested against candidate sub-accounts (its currently recorded
    OwnerID first, then the roster's unarchived accounts) until the channel accepts an
    owner-scoped inventory read. That acceptance is the match.
- Outcome per pair, shown inline:
  - **Already correct** — the pair matches the OwnerID it is stored against (scope stamped
    `child`, verified timestamp refreshed).
  - **Rematched** — the pair belongs to a different roster account; the row is moved to
    that OwnerID (login email updated from the roster) after confirming the target has no
    conflicting pair. If the target already holds a different pair, the row is flagged as a
    duplicate instead of overwriting it.
  - **Master pair** — kept on record but marked `master_pair`, with the note that Step A
    must mint a real sub-account pair.
  - **Orphan** — no roster account accepts the pair (account closed, or key revoked at the
    channel); reported with a "remove locally" action rather than a silent delete.
- Roster rows gain a small key badge: *child key held*, *master pair (unusable)*, *no key*,
  so mismatches are visible before and after a rematch.

## Rate discipline

The probe is a read-only channel call per candidate, so the run is paced: one pair at a
time, candidates tried in order and stopped on the first accept, a short gap between
calls, and the roster read reused from the existing cache instead of re-fetched per pair.
Progress and the current pair are shown while it runs; the operator can stop after the
current pair.

## Technical notes

- `supabase/functions/ru-cert-portal/index.ts`: new `rematch_stored_keys` action —
  loads `ru_api_credentials` (decrypting `secret_enc` under service role), reads the master
  roster, and for each row calls `rentalsunited-api` `verify_child_key_owner` with the
  candidate OwnerID. `key_scope`/`key_scope_verified_at`/`key_scope_detail` are written
  from the verdict; a rematch updates `ru_owner_id` + `login_email` on the row, honouring
  the existing unique constraint on `ru_owner_id` (conflict ⇒ report, don't overwrite).
  Secrets are never returned to the browser; only the AccessKey's last 4, the verdict and
  the matched OwnerID.
- `src/components/admin/channel-monitor/MasterRosterPanel.tsx`: "Rematch stored keys"
  button, per-pair progress list with the four outcome states, key badges on roster rows,
  and invalidation of the same queries the roster read and close flow already refresh.
- No schema change: `key_scope`, `key_scope_verified_at` and `key_scope_detail` already
  exist on `ru_api_credentials`.
- Existing constraints kept: master pairs are never rematched onto a sub-account or used
  for child writes, and one AccessKey never sits on two OwnerIDs.
