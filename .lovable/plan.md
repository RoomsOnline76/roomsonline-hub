# Channel Manager Cost Monitor (/admin/channel-monitor)

A single admin page that shows exactly what the Channel Manager account will cost next month, how many properties and units are live, and lets a privileged user archive or re-activate a whole property with one click plus confirmation.

## Billing model to encode

Listing count = active units/rooms pushed to the Channel Manager (per unit/listing, not per property).

Tiered fixed monthly price per listing:
- 101-500 listings: EUR 3.50
- 501-1000 listings: EUR 3.00
- 1001+ listings: EUR 2.50
- Below 101 listings: no tier price applies, only the period minimum

Period minimums (billed as "minimum or actual usage, whichever is higher"):
- 2026-09, 2026-10: Grace period (EUR 0)
- 2026-11, 2026-12: EUR 250.00 minimum
- From 2027-01-01: EUR 500.00 minimum

Forecast = max(period minimum, listings x tier rate). Shown in EUR with a ZAR conversion using the existing FX rates (EUR/ZAR, with the rate date and source displayed).

## The page

Route `/admin/channel-monitor`, admin/dev/fearless-leader only, linked from the Channel Manager admin area.

**Top summary band**
- Forecast for the current month: EUR amount, ZAR equivalent, tier applied, and whether the minimum or actual usage is driving the number
- Billable listings (active units carrying a Channel Manager listing)
- Active properties syncing / properties archived
- Units archived or deactivated this month
- Next-period preview (what the bill becomes at the next minimum step if the listing count stays flat)
- A "distance to next tier" line (how many more listings until the per-listing rate drops)

**Rolling schedule table**
Month-by-month rows from Sep 2026 through Jan 2027 and beyond: minimum, projected usage at today's listing count, and the amount that would actually be billed.

**Property table**
One row per property with a Channel Manager footprint: property, portfolio, sync state (Live / Paused / Archived), listing count (active units), archived units, monthly cost contribution, last successful push. Filters for state and portfolio, and a search box. Expanding a row lists its units with listing ID and active state.

**Archive / re-activate**
- One button per row. Archive opens a confirmation dialog naming the property, its unit count, and the EUR/ZAR monthly saving.
- Archiving: marks the property archived, turns off channel pushing, marks its units inactive for channel purposes, and calls the Channel Manager API to archive the listings so billing stops. Existing RU listing IDs are kept so re-activation is a re-push, not a rebuild. The property keeps working inside ROL'OS.
- Re-activating: separate confirmation, then re-enables pushing, un-archives at the Channel Manager, and sends an email to dev@roomsonline.co.za and carike@roomsonline.co.za. The email leads with the re-activated property name and its unit count, followed by the current account summary (total billable listings, tier, month forecast in EUR and ZAR, active vs archived properties).
- Every archive/re-activate is written to the audit log with who did it.

## Technical notes

- Reuse the existing `channel-manager-entitlement` edge function, which already archives/re-activates a property at Rentals United via `rentalsunited-api` `set_property_status` and sets `properties.ru_archived` / `ru_archived_at` / `ru_push_enabled`. It gets extended to (a) also deactivate/reactivate the property's units in `hostfully_room_types` for channel purposes, (b) accept a `reason` and write an audit-log row, and (c) trigger the re-activation email.
- Listing counts come from `hostfully_room_types` rows with a `rentalsunited_property_id` where `is_active` is true, joined to active properties — the same source the health report now uses. Property-level listing IDs on `properties` count as one listing when no unit rows exist.
- New shared module `src/lib/channelBillingForecast.ts`: pure functions for tier lookup, period minimum by month, and forecast calculation, with unit tests. This keeps the same maths reusable by reports later.
- New hook `src/hooks/useChannelCostMonitor.ts` fetches properties, units, portfolios, last push evidence from `ru_sync_runs`, and the latest EUR/ZAR rate; returns the aggregate plus per-property rows.
- New page `src/pages/AdminChannelMonitor.tsx` composed of small components (`ChannelCostSummary`, `ChannelBillingSchedule`, `ChannelPropertyTable`, `ArchivePropertyDialog`) so no file grows large.
- A small archive-history table records each archive/re-activate event (property, units affected, actor, direction, timestamp) so the "archived this month" counters and audit trail are real rather than inferred. Added via a migration with grants and RLS limited to admin/dev/fearless-leader.
- Re-activation email sent through an edge function using the existing platform sender helpers, addressed to the two fixed recipients.
- Vendor naming stays out of the ROL'OS-facing copy; this admin page keeps Channel Manager terminology with vendor naming allowed where the admin integrations area already uses it.
