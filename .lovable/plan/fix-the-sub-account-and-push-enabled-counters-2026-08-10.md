# Fix the sub-account and push-enabled counters

## What is actually wrong

Two separate problems, one of them a data error.

**1. SEESIG is flagged as a sandbox property.** In the properties table, `SEESIG Self Catering CHALETS` has `is_sandbox = true`. Every channel counter filters sandbox records out of the trading scope, so SEESIG — which is live, push-enabled, and carrying 9 unit listings — is silently dropped from both cards. That is why "Push enabled" says **1 of 3**: only Tidal Pools survives the filter. The property table below uses a different rule (channel footprint) which is why it still correctly shows 2 of 2.

**2. The denominator counts the wrong population.** "Properties under sub-accounts" counts *every trading property in the sub-account's portfolio*, whether or not it has anything on the channel manager. In the Jongensfontein portfolio that is Dassiesingel, Fonteinhutte and Tidal Pools — Dassiesingel and Fonteinhutte have no channel listings at all and push switched off, so they pad the number to 3 and make "1 of 3" read as a failure when nothing is failing.

## What changes

1. **Correct the SEESIG record** — clear the incorrect `is_sandbox` flag so it re-enters trading scope. Once corrected, SEESIG is counted as push-enabled everywhere (channel monitor, portfolio RU card, health counters).

2. **Scope both cards to the channel footprint.** "Properties under sub-accounts" becomes the number of sub-account properties that actually have a channel footprint (a building listing or at least one unit listing). Portfolio siblings with nothing on the channel manager are no longer in the denominator, and a hint line reports them separately ("2 portfolio properties not on the channel manager") so they stay visible rather than hidden.

3. **"Push enabled" reads against that same footprint** — with SEESIG corrected and the footprint scoping applied, the card reads **2 of 2**, matching the property table directly beneath it.

4. **Keep the Portfolio Management → Rentals United card in step** so clicking through lands on the same numbers.

## Technical notes

- Migration to set `is_sandbox = false` on the SEESIG property row (data correction only, no schema change).
- `src/hooks/useChannelCostMonitor.ts`: intersect `subAccountPropertyIds` with the set of properties having a channel footprint (`rentalsunited_property_id`, `ru_archived`, or any unit with `rentalsunited_property_id`) before computing `subAccountProperties` and `pushEnabledProperties`; add a count of footprint-less sub-account properties.
- `src/components/admin/channel-monitor/ChannelCostSummary.tsx`: show the new hint lines on both cards.
- `src/components/portfolio/PortfolioRuAccountsTab.tsx`: apply the same footprint scoping so both surfaces agree.
- Counting and display only — no channel pushes, no listing state touched.
