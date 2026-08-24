# Channel Monitor: strip the dead sub-tabs, consolidate engineering surfaces

The left rail goes from nine items to five: Onboard Property, Accounts & Company, Cost Monitor, Cert Status & Logs, Advanced (Dev only). Everything an engineer needs but an operator never touches ends up in Advanced; the rest is deleted.

## Rail after the change

```text
Onboard Property        (unchanged)
Accounts & Company      (unchanged)
Cost Monitor            (unchanged — keeps the single "Reconcile with channel" panel)
Cert Status & Logs      (certification console + channel step ledger)
Advanced (Dev only)     (call queue + exchange log + cert runs + refresh compliance
                         + error handling + sync observability)
```

## Deletions

- **Property Binding** — removed as a rail item. The building-container panel is deleted, and its "Reconcile with channel" duplicate goes with it (the Cost Monitor copy stays as the only one).
- **Room & Rate Mapping** — removed entirely, including the "Open certification coverage" shortcut.
- **ARI Live Lab** — removed entirely: property picker, availability playground and pricing playground.
- **Reservation Round-Trip** — removed, except the **Booking sync trail**, which moves into Advanced. The reservation ingest / lookup panel is dropped.
- **Channel Diagnostics page** (`/admin/integrations/rentals-united`) is archived: the route and page are removed, along with its Currency, Live notifications, Content quality, Buildings, Onboarding-redirect, Reservations and Coverage panels. Its Sync observability and Error handling panels survive by moving into Advanced.
- **Verify channel calendar** is removed from Advanced, and so is the "Open channel diagnostics" card.

## Cert Status & Logs after the change

Keeps the certification console (milestones, coverage, availability window, pricing window, discounts, WL readiness, user management) and the Channel step ledger. Its **Exchange log**, **Recent certification runs** and **Refresh compliance** move to Advanced.

## Advanced (Dev only) after the change

In order: channel call queue, exchange log (searchable, still the deep-link target from the booking sync trail), booking sync trail, recent certification runs, refresh compliance (cadence), error handling, sync observability (KPIs, endpoint progress tracker, manual run triggers).

## Technical notes

- `src/pages/AdminChannelMonitor.tsx`: `TabKey` and `RAIL` shrink to the five keys; `railChips` loses the `binding`/`mapping`/`ari`/`reservations` entries; legacy `?tab=` values (`binding`, `mapping`, `ari`, `reservations`, `diagnostics`) map onto surviving tabs via `LEGACY_TAB_MAP` so existing deep links and health-report links don't 404 into the default view. `ariPropertyId`, `openCert` and the coverage/availability/pricing shortcuts are dropped; the exchange-log collapsible, its ref and `exchangeSearch` move to the Advanced branch so the booking-trail deep link keeps scrolling to it (no cross-tab hop needed any more).
- The certification console (`RuCertificationConsole` via `ChannelCertificationTab`) is split by moving its `runs` and `cadence` tab content into standalone panels rendered from Advanced; the console keeps the remaining tabs and its default tab becomes `milestones`.
- Sync observability and error handling become extracted panels under `src/components/admin/channel-monitor/` (KPI/tracker/manual-runs block and `RuErrorHandlingTab` wrapper with the runs query they need) so Advanced can render them without the diagnostics page.
- Files deleted: `src/pages/AdminRentalsUnited.tsx` and its route in `src/App.tsx`, `RuBuildingsPanel`, `RuAvailabilityPlayground`, `RuPricingPlayground`, `RuCalendarVerifyPanel`, `RuCoverageTab`'s monitor mount (the component stays only if the cert console's Coverage tab still uses it), `RuCurrencyPanel`, `RuLnmPanel`, `RuMcqReportPanel`, `RuReservationsPanel` monitor mount.
- Any remaining links to `/admin/integrations/rentals-united` elsewhere in the app (health report, nav, admin index) are repointed at `/admin/channel-monitor?tab=advanced`.
- No database or edge-function changes; this is a UI consolidation only.
