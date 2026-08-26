# Archive OwnerID 742004 and close the gap that hid it

## What is wrong

The master roster cache holds four sub-accounts. One of them is:

```text
owner_id: 742004
login:    Archived_ru-owner@roomsonline.co.za
archived: true
```

The Advanced → Orphan distribution accounts panel drops every roster entry whose
`archived` flag is true before it works out which accounts are unbound. So 742004
can never be listed and never be archived from the UI — even though it is not in
`ru_retired_accounts`, which is the only registry the edge functions consult when
excluding accounts from reads, counts and health checks. Result: the account keeps
flowing through channel reads while being invisible in the panel meant to retire it.

## Fix

1. Retire 742004 now: add it to the retired registry as
   `Archived_ru-owner@roomsonline.co.za` with a reason noting it is archived at the
   channel and unbound in ROLOS. This immediately drops it from every read,
   listing count, cost attribution and compliance sweep.
2. Stop the panel from hiding channel-archived accounts. Unbound entries are shown
   regardless of the channel-side `archived` flag, with a small "Archived at channel"
   badge so it is clear why the row exists. Entries already in the retired registry
   stay hidden from the orphan list (they appear under "Archived accounts").
3. Keep the existing safety check unchanged: an account that is bound to a property
   or portfolio is never archivable.

## Technical notes

- Data change: one row upserted into `ru_retired_accounts` (owner id 742004).
- Code change: `src/components/admin/channel-monitor/OrphanSubAccountsPanel.tsx` —
  remove `!u?.archived` from the roster filter, carry the flag onto the row and
  render the badge. No backend or schema change; `ruRetiredAccounts.ts` already
  performs the exclusion for all consumers.
