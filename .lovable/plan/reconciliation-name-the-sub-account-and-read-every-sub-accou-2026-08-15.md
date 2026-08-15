# Reconciliation: name the sub-account, and read every sub-account

## What the data actually shows

Answering your questions directly, from the channel and from our records:

- There is **one** distribution account registered in ROL'OS: **OwnerID 741765**. Its portal login is `rooms@roomsonline.co.za`; the contact address stored against it is `connect@roomsonline.co.za`. So the wizard and the reconcile report are talking about the *same* account — they just print different fields of it. That is the mismatch you spotted, not two different accounts being used.
- Jongensfontein properties are bound to, pushed to, and read back from **741765** only.
- The master account, however, holds **seven** sub-accounts. Two of them carry `rooms@roomsonline.co.za`: **741765** and **741761**. There are also `Jongensfontein.com Owner` (741771), two `Dawie Erasmus` accounts (741777, 741778), an API test account (741769) and a test owner (741776).
- Reconcile today loops **only** over accounts that exist in our own table — that is just 741765. **741761 and the other five are never read**, which is why the counts you see in the portal (30 on one account, 13 on the other) never add up to the reconcile totals.

## What to change

### 1. One canonical account label everywhere
Print sub-accounts as `rooms@roomsonline.co.za · OwnerID 741765 (contact connect@roomsonline.co.za)` — portal login first, because that is the login you use in the channel portal. Same label in the Channels wizard, the push/read-back toasts, the cost monitor and the reconcile report, so no screen can imply a different account from another.

### 2. Reconcile every sub-account under the master, not just ours
Reconcile starts by asking the channel for its own sub-account roster, then reads each one:

```text
master account
  ├── 741765  rooms@…      bound   → read listings, classify against ROL'OS
  ├── 741761  rooms@…      unknown → read listings, report as foreign account
  ├── 741771  Jongens…     unknown → read listings (needs keys) / "not read"
  └── … 741769, 741776, 741777, 741778
```

Each account is reported with: portal email, OwnerID, live count, archived count, whether ROL'OS has it bound, whether we hold API keys for it, and the read outcome (read / rate-limited / no keys / not read within the time budget).

### 3. Listing evidence names its account
Every orphan, duplicate and matched row shows the account email + OwnerID it was read from, so "30 here, 13 there" is visible in the report instead of being inferred.

### 4. New bucket: listings on a foreign sub-account
A listing found on an account ROL'OS does not have bound is **not** an orphan to delete. It goes into a separate "on another sub-account" bucket, showing the listing id, name, and the account holding it, with two explicit, admin-only choices per row: **re-point** the local record to that listing, or leave it and clean it up in the portal. No automatic archiving or deleting of anything on an unbound account.

### 5. Accounts we cannot authenticate as
Accounts with no stored key & secret cannot be read. They are listed as "no keys — not read" with a one-click way to capture keys for that account, instead of being silently skipped (today's behaviour, which made the report look complete when it was not).

## Technical notes

- `channel-manager-entitlement` (`scope: "reconcile"`): source the owner set from `rentalsunited-api` `list_users` (`Pull_ListMyUsers_RQ`) unioned with `ru_owner_accounts`, instead of `ru_owner_accounts` alone. Keep the existing 45s total / 15s per-account budget and the mutually exclusive bucket classification; add `bound`, `has_keys`, `login_email`, `archived_count` to each `accounts[]` entry and `owner_email`/`owner_label` to every listing row.
- Label helper shared by `ru-cert-portal`, `push-property-to-ru` and the UI: `ru_login_email ?? owner_email` + `(OwnerID …)`, with the contact email in parentheses when it differs. Removes the connect@/rooms@ divergence at the source.
- `useChannelReconciliation.ts`: extend result types (accounts roster, `foreign_listings[]`).
- `ChannelReconciliationPanel.tsx`: render an always-visible account roster table (email, OwnerID, live, archived, bound, read state) above the buckets — today accounts only appear when they error — plus the "on another sub-account" section with re-point / ignore actions reusing the existing `repoint_local_listing` and `clear_local_listing` paths.
- Read-only: no push, archive or delete calls are added by this work.
