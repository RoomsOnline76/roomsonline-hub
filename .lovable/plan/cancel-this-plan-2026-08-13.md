# cancel this plan   
  
Channel Monitor: make the test-inventory exclusion visible and consistent

## What is actually happening

Seesig Self Catering Chalets and Tidal Pools Self Catering Apartments are both flagged as **sandbox / test** records in the database. The channel monitor deliberately excludes test records from the sub-account and push counters, so those two cards read `0` and `0 of 0`. Nothing is broken in the channel connection itself — both properties really are pushing to the channel manager, and the property table below does not apply the test filter, which is why the same page shows them as **Live** with 9 and 4 listings.

So the page is telling two different stories with no explanation.

## Decision

Test properties stay excluded from counters (as you confirmed). The fix is to apply that exclusion consistently and say so on screen.

## Changes

1. **Label test records.** Each row for a sandbox property gets a small neutral "Test" chip next to the property name, so Live + excluded-from-counters is self-explanatory.
2. **Consistent exclusion in the summary cards.** Billable listings, forecast cost, ROL revenue, channel margin, properties syncing, sub-account properties and push-enabled all use the same trading scope — test inventory is left out of every one of them, not just two cards. Today "Billable listings 13" counts the test units while the push card does not.
3. **One honest footnote.** The summary strip gains a single line when test records exist: "2 test properties (13 listings) excluded from counters" with the property names on hover, so the numbers can be reconciled at a glance.
4. **Keep the table complete.** The properties table continues to list test properties (with the chip) so archiving, reconciliation and push actions remain available for them.

## Technical notes

- `src/hooks/useChannelCostMonitor.ts`: introduce one `isTradingProp` scope and apply it to the `derived` aggregates (`billableListings`, `activeProperties`, forecast/tier inputs, ROL revenue) as well as the existing footprint counters; additionally expose `excludedTestProperties` (count, listing count, names) for the footnote. Property rows keep their existing `isTrading` flag.
- `src/components/admin/channel-monitor/ChannelCostSummary.tsx`: render the footnote line from the new field.
- `src/components/admin/channel-monitor/ChannelPropertyTable.tsx`: render the "Test" chip when `isTrading` is false.
- No database or edge-function changes; the sandbox flags on both properties stay as they are.