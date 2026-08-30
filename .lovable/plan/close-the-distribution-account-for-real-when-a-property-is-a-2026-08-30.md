# Close the distribution account for real when a property is archived or sterilized

## What the records show (verified)

`ru-c@polka.co.za` is OwnerID **742632**. In the retired registry it is stamped
`channel_archived_at = 2026-08-30 12:24:56` with reason "sdfjk", written by the
`retire_owner_account` path. Its stored result says:

```text
key_revoke: no_credentials — "Cannot revoke at the channel: no sub-account credentials on file."
archived_listings: []   refused_listings: []   keys_revoked_at_channel: false
```

And in the channel exchange log there is **no `Push_ArchiveUser_RQ` for 742632 at all** —
the only closes that ran that day were 742620 and 742630 (both status 0, via `ru-close-user`).

So three things are true at once, and together they explain why the portal login still works:

1. `retire_owner_account` never calls the channel's close-user verb. It archives listings,
   writes the retired-registry row, revokes keys when it can, disconnects the property — and
   stops. The account itself stays open.
2. `channel_archived_at` is stamped when **no listing refused**. For 742632 there were zero
   listings, so "no refusals" was trivially true and the row reads as archived at the channel
   although nothing was archived and nothing was closed.
3. On the archive dialog, "Also close the distribution account" is an **opt-in tick box**, and
   the close it runs (`ru-close-user`) needs the sub-account's own key pair or password. 742632
   had no credentials on file, so even if it had been ticked the close would have been refused.

Sterilize has the same shape: it stamps the registry and deletes the binding, without a close.

## What will change

### 1. Closing the account becomes part of the teardown, not an optional extra

Archive-with-teardown and sterilize both run a single shared **close-account step** after the
listings are archived:

- authenticate as the sub-account (stored child key pair, else the portal password supplied in
  the dialog, else mint a pair if the channel allows it),
- send the close-user verb,
- re-read the master roster and confirm the account is gone or shows as archived,
- only then stamp the registry.

Master key pairs are never used for the close (the verb closes whoever authenticates).

### 2. Honest status instead of an inferred one

`channel_archived_at` is stamped only when the roster re-read confirms the account is closed.
Two new explicit outcomes are recorded and shown per account:

- `closed_at_channel` — confirmed by the roster re-read
- `close_not_possible` — with the channel's own reason (no credentials, login refused,
  rate-limited, still bound)

"No listings, therefore archived" stops counting as success. Rows already in this state —
742632 and every other retired row with `keys_revoked_at_channel: false` and no close in the
log — are re-flagged as **not closed at the channel** so they resurface for action.

### 3. Credentials prompt at the point of teardown

The archive/sterilize dialog gains one password field (used for the run only, never stored),
shown when the account has no proven child key pair. Without it, the run reports plainly that
the account cannot be closed and leaves it listed as outstanding rather than claiming it is
gone.

### 4. A "Close at channel" catch-up action

In Channel Monitor → Advanced, retired rows that were never confirmed closed get a per-row
**Close at channel** button plus a **Close all outstanding** runner (sequential, respecting the
existing 30s–5m close cooldown and one-in-flight lock). That is how 742632 and its siblings get
finished off without re-archiving anything.

## Technical notes

- New shared helper in `supabase/functions/ru-cert-portal/index.ts` — `closeAccountAtChannel(ownerId, auth)` — wrapping the existing `close_unbound_account` logic (child-only auth, `ru_call_queue` serialisation with `action='ru_close_account'`, retry on the channel's -5/-6 rate statuses, roster verification). Called from `retire_owner_account`, `sterilize_property`, and a new `close_retired_account` action for the catch-up runner.
- The "unbound only" guard in the existing close path is relaxed for these callers, because the binding is deleted in the same run: the guard becomes "not bound **after** step 3" instead of "never bound".
- `channel_archive_result` grows an `account_close` block (`{status, verified_via_roster, message, attempts}`); `channel_archived_at` is set from that block, not from the listing loop.
- `src/pages/AdminChannelMonitor.tsx` / `ArchivePropertyDialog.tsx`: close becomes part of the teardown path with the password field and per-step result lines; `MasterRosterPanel.tsx` / `OrphanSubAccountsPanel.tsx` gain the catch-up action and the not-closed badge.
- No schema change: the detail lives in `channel_archive_result`.
