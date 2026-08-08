# Channel Cost Monitor: show ZAR cost vs ROL billing value

Add rand context next to every euro figure on the Channel Manager Cost Monitor, plus what ROL charges owners per listing, so cost and revenue sit side by side.

## What changes

1. **Per-listing rate in ZAR (ROL cost)**
   - The "more listings drop the rate to EUR 3.50 per listing" line also shows the rand equivalent at the live EUR/ZAR rate.
   - The current effective per-listing rate (tier rate, or the tier floor while under 101 listings) is shown in both EUR and ZAR on the Billable listings card.

2. **ROL default billing value per listing (ROL revenue)**
   - Read the platform default channel-manager per-unit fee from the global billing defaults (currently R60/unit/month) and show it as "ROL bills R.../listing/mo".
   - New summary card: **Channel margin** — ROL revenue (default fee x billable listings) minus forecast cost in ZAR, with the per-listing spread underneath.

3. **Next step line**
   - "Nov 2026 becomes EUR 250.00" gains the ZAR equivalent in parentheses.

4. **Grace period state**
   - While in grace, cost shows EUR 0 / R0 and the margin card shows the full ROL revenue as margin, labelled as grace-period.

If the FX rate cannot be fetched, the ZAR figures are suppressed (as today) and the euro values stand alone.

## Technical notes

- `src/hooks/useChannelCostMonitor.ts`: also select `channel_manager_per_unit_fee` from `billing_global_defaults` (default row) and expose it as `rolPerListingZar`, plus a derived `rolRevenueZar` (fee x billable listings) and `effectiveRateEur`.
- `src/components/admin/channel-monitor/ChannelCostSummary.tsx`: render the ZAR conversions and the new margin card using the existing `formatEur` / `formatZar` helpers from `src/lib/channelBillingForecast.ts`. No forecast maths changes — tier and minimum logic stay as-is.
- Presentation-only apart from the extra read of the existing billing defaults row.
