# "1 more listing on the account than we bill for" — false alarm

## What is actually true right now

The five properties on the channel hold **27** active units with a channel listing (Fonteinhutte 9, Seesig 9, Tidal Pools 4, Dassiesingel 4, RU Test 4 = 1). The reconcile read also returned 27 live listings, all 27 matched locally, 0 orphans, 0 duplicates. So the billable count and the account agree — there is nothing unbilled.

The badge is comparing two different snapshots:

- `channel_listing_count` (27) comes from the live reconcile read you just ran (21:33).
- The billable number it subtracts from comes from the cost-monitor data loaded when the page first opened, which was still on the pre-push footprint (26 — the nightly run at 03:10 recorded exactly `26 live / 26 billable`, before RU Test 4's listing existed).

Nothing refreshes the cost-monitor snapshot when a reconcile finishes, so any listing added during the session shows up as a permanent phantom "1 more listing than we bill for".

## Fix

1. Derive the disparity from the reconcile result alone — the same rule the nightly cron uses (`matched` from that read). A live listing that is not matched is by definition an orphan or a duplicate copy, both already counted in the panel. Concretely: the badge becomes red only when `channel_listing_count > matched + duplicates + orphans` (a classification gap) or when orphans/duplicates exist; otherwise it reads "Billing count matches the account".
2. Refresh the cost-monitor snapshot when a reconcile completes, so the "listings billable" stat and the per-property table reflect the same moment as the read.
3. Keep the cross-check, but honestly: if after that refresh the local billable total still differs from the live count, show it as a separate line naming both numbers and their timestamps, instead of a bare "we bill for less" claim.

## Technical notes

- `src/components/admin/channel-monitor/ChannelReconciliationPanel.tsx`: replace `gap = result.channel_listing_count - billableListings` with the bucket-based gap already computed as `liveBucketTotal`; wire the reconcile completion to `onChanged()` so the parent refetches.
- `src/pages/AdminChannelMonitor.tsx`: pass the existing `data.refresh()` through as the reconcile-completed callback (already passed as `onChanged`).
- No edge function or billing-logic change: `cron-channel-reconcile` already computes `local_billable_listings` from the same read and correctly recorded no disparity.
