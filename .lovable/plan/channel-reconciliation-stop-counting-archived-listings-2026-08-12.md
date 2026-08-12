# Channel reconciliation: stop counting archived listings

## What the data actually shows

I checked the channel logs and the database before writing this:

- There is exactly **one** channel account on record: owner `741765` (`connect@roomsonline.co.za`, portfolio-scoped). No master-account listing was read — every one of the 33 listings the reconciliation returned came from that one sub-account, so nothing is sitting on the master account.
- Locally we map **9** listings (Seesig units, ids `5763142`–`5763199`) — the same 9 the channel portal shows.
- The other 24 are older ids (`5655xxx`, `5733xxx`) from earlier repeat pushes. The reconciliation itself already labels them "archived upstream".
- The clean-up did work: the archive calls returned `Status ID="0" Success` for each id. The channel manager keeps archived listings in its API property list (flagged `NLA="true"`) and only hides them in its own portal — which is why the portal shows 9 while the API returns 33.

So this is a classification bug on our side, not a failed clean-up: we count and re-list listings that are already archived and no longer billable.

## What to change

1. **Count only live listings.** "On the channel" becomes the number of non-archived listings. Archived ones are excluded from the counter and from the billing-gap badge, so 9 local vs 9 live reads as "matches the account".
2. **Separate the archived bucket.** Archived listings with no local record move out of "Orphans on channel" into a collapsed "Archived on the channel — not billable" list (id, name, count). Orphans stay reserved for *live* listings we do not bill for — those are the real problem rows.
3. **Clean-up only touches actionable rows.** With archived rows out of the orphan bucket, "Clean up all" no longer re-archives things that are already archived (which is what made it look like nothing happened). If a live orphan turns out to already be archived when we push, we mark it resolved instead of leaving it on the list.
4. **Re-read after clean-up** so counters and the footer reflect the channel, not an optimistic local guess (already partly in place — this keeps it and makes the archived split part of the refresh).
5. **Master-account guard.** Add an explicit check to the reconciliation output stating which account(s) were read, and flag as a violation (red) any listing returned for the master/parent account rather than a linked sub-account. White-label rules forbid listings on the master account, so this makes it visible and provable rather than assumed. Note: the channel manager has no "delete property" API — archive is as final as it gets, so the goal is that the master account never receives a push, which the existing child-credential locks already enforce.

## Technical notes

- `supabase/functions/channel-manager-entitlement/index.ts` (`reconcile` scope): split the per-account listing loop into `live` and `archived`; set `channel_listing_count` from live only; return `archived_orphans` and `archived_matched` arrays plus `archived_count`; keep `accounts[]` and add an `is_master` flag per account.
- `purge_listing` scope: treat a listing already reported archived as success (no wasted `Push_SetPropertiesStatus_RQ`), and still clear any local id.
- `src/hooks/useChannelReconciliation.ts`: carry the new fields, keep `cleanupAll` limited to live orphans + stale ids.
- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: new stat tiles ("On the channel (live)", "Archived — not billable"), collapsed archived section, gap badge from live count only.
- No database or schema change required.
