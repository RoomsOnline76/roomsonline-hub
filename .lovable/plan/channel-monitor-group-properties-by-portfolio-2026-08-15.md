# Channel Monitor — group properties by portfolio

Make the "Properties on the Channel Manager" table read as portfolio blocks instead of one flat list.

## What changes

- Rows are grouped under a portfolio header row: portfolio name, property count, total listings, total duplicates, and combined monthly cost (EUR with ZAR underneath, same formatting as today).
- Properties without a portfolio fall into an "Unassigned" group, sorted last.
- Each portfolio group can be collapsed/expanded; groups start expanded. Collapsing hides its properties (and any open unit rows inside).
- Existing per-property row, unit expansion, archive/reactivate, and duplicate purge actions stay exactly as they are.
- The Portfolio column stays for clarity but is de-emphasised inside a group (muted, shown only as the sub-account/owner hint already present).
- Search, state filter, and portfolio filter keep working; groups with no matching rows are hidden, and the "x of y" counter stays property-based.
- Sorting: portfolios alphabetically, properties alphabetically inside each portfolio.

## Technical notes

- Change is confined to `src/components/admin/channel-monitor/ChannelPropertyTable.tsx` (presentation only).
- Derive groups with a `useMemo` over the existing `filtered` array; aggregate `listings`, `duplicates`, and monthly cost via the current `formatEur`/`formatZar` helpers and `fx`.
- Track collapsed portfolio keys in local state (`Set<string>`); no changes to `useChannelCostMonitor` or any backend query.
