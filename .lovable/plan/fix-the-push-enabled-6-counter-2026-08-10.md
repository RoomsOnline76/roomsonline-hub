# Fix the "Push enabled 6" counter

## What the 6 actually is

There is one channel sub-account (Jongensfontein portfolio) covering 4 properties — that explains the 4 and the 1. The "Push enabled" counter is not scoped to that footprint at all: it counts every property in the database with channel push switched on, which today is 6:

- Dassiesingel Self-catering Units (Jongensfontein)
- Fonteinhutte Self-Catering Chalets (Jongensfontein)
- SEESIG Self Catering CHALETS (Jongensfontein)
- Tidal Pools Self Catering Apartments (Jongensfontein)
- Latter Days - STILBAAI (not under the sub-account)
- [SANDBOX] Woodlands Close (a sandbox/test property)

So the number is real but meaningless as shown: it mixes the sub-account footprint with an unrelated property and a sandbox record.

## What changes

1. **Scope the counter to the sub-account footprint.** "Push enabled" becomes push-enabled properties *within* the sub-account footprint — 4 of 4 for Jongensfontein — so the three cards read consistently against each other.

2. **Surface anything outside the footprint instead of silently folding it in.** The card hint reads "4 of 4 sub-account properties" and, when there are push-enabled properties with no sub-account (today: Latter Days, plus the sandbox record), adds a second line: "2 outside any sub-account". That is the signal an admin actually needs — listings pushing without a linked account.

3. **Exclude sandbox / non-trading properties** from both the footprint and the outside-footprint count, matching the trading-scope rule used elsewhere in the monitor, so `[SANDBOX] Woodlands Close` stops inflating channel counters.

4. **Keep the Portfolio Management → Rentals United card in step** so clicking through no longer lands on a different number than the one clicked.

## Technical notes

- `src/hooks/useChannelCostMonitor.ts`: compute `pushEnabledProperties` as the intersection of `subAccountPropertyIds` and properties with `ru_push_enabled`, filtered to trading properties; add `pushEnabledOutsideAccounts` for the remainder.
- `src/components/admin/channel-monitor/ChannelCostSummary.tsx`: update the "Push enabled" card value/hint to the "x of y sub-account properties" form plus the outside-footprint line.
- `src/components/portfolio/PortfolioRuAccountsTab.tsx`: apply the same scoping/trading filter to its push-enabled counter so both pages agree.
- Counting logic only — no channel pushes, no property records touched.
