# Channel Monitor: left-rail navigation reshuffle

Pure navigation and layout change on `/admin/channel-monitor` (the page that hosts Account Manager and Cost Monitor). No business logic, edge function, data model, or panel internals change.

## What changes

The five top tabs (Cost & listings / RU Accounts Manager / Certification / Reservations / Diagnostics) are replaced by a compact sticky left rail with eight items. Each rail item shows its title plus a one-sentence "What this tests" line, and the active item is clearly highlighted. Content renders in the pane to the right, using the same components that render there today.

## Rail items and what each shows

1. **Accounts & Company** — "Create / archive sub-users and push company details required for cert."
   Existing Account Manager (`PortfolioRuAccountsTab`), including the new Push Company Details button. Untouched.
2. **Cost Monitor** — "Confirms billable listing counts and forecast spend per sub-account."
   Today's cost view exactly as-is: cost summary, billing schedule, property table, reconciliation, archive log, plus its archive/purge dialogs.
3. **Property Binding** — "Verifies each property is bound to the correct channel listing and building."
   Existing `RuBuildingsPanel` plus the reconciliation panel, mounted unchanged.
4. **Room & Rate Mapping** — "Checks room types and rate plans map to live channel listings."
   Existing `RuCoverageTab`, mounted unchanged, plus a button that opens the certification console on its Coverage sub-tab.
5. **ARI Live Lab** — "Runs live availability and pricing reads against the channel for a chosen property."
   Existing `RuAvailabilityPlayground` and `RuPricingPlayground` with the page's existing property picker feeding their `propertyId` / `propertyName` props, plus deep-open buttons for the console's Availability window and Pricing window sub-tabs.
6. **Reservation Round-Trip** — "Creates, modifies and cancels reservations end-to-end and shows the sync trail."
   Existing `RuReservationsPanel` and `BookingSyncTrailPanel` (the trail keeps its jump-to-exchange behaviour).
7. **Cert Status & Logs** — "Full certification console with run history and the searchable RU exchange log."
   Existing `ChannelCertificationTab` (the whole console, its own default sub-tab) plus `ChannelLedgerMetricsPanel` and `RuApiLogPanel`.
8. **Advanced (Dev only)** — "Queue, retries and low-level channel plumbing for engineers."
   Existing `ChannelCallQueuePanel`, `RuCalendarVerifyPanel` and `RuErrorHandlingTab`, mounted unchanged. Visible to dev/admin roles only, matching the page's existing role gate.

## Certification console deep-open

`RuCertificationConsole` gets one optional `initialTab` prop. When absent it opens on `runs` exactly as today; when passed it opens on that sub-tab. No internal state, logic, or sub-tab behaviour changes. The console's home stays rail item 7; items 4 and 5 can deep-open it on the matching sub-tab.

## Technical notes

- `AdminChannelMonitor.tsx` keeps all current state, hooks, dialogs, `ChannelRuStatusStrip`, and header refresh. Only the `Tabs`/`TabsList`/`TabsContent` wrapper is swapped for a two-column grid: sticky rail (`sticky top-4`, buttons styled with existing tokens) and content pane.
- The existing `TabKey` search-param sync is extended to the new eight keys, with the old keys (`cost`, `accounts`, `cert`, `reservations`, `diagnostics`) still accepted and mapped so `ChannelRuStatusStrip`'s `onNavigate` links and existing bookmarks keep working.
- Panels stay lazy-loaded per rail item with the current `Suspense` skeletons; the panels moved in from the Channel Diagnostics page are also lazy-loaded so the default view stays fast.
- The Channel Diagnostics page (`/admin/integrations/rentals-united`) is left as it is; these panels are reused, not moved.
- Verification: typecheck, then a browser pass clicking all eight rail items to confirm each renders and no console errors appear.
