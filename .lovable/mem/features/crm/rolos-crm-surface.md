---
name: ROL'OS CRM surface (HubSpot add-on)
description: /pms/crm page, capability-gated CRM nav item, read-only guest enrichment panel, optional default-off message logging
type: feature
---
HubSpot is surfaced as a first-class ROL'OS capability but remains a CRM **adapter only** — native messaging, bookings and guest records stay the source of truth.

- Nav: `CRM` item in the Front Desk group (`module: "guests"`), hidden unless the add-on is connected AND enabled. Gate lives in `isNavItemVisibleForAddons()` (`NavItem.requiresHubspot`), applied in both `PMSSidebar` and `PmsMobileBottomNav`.
- Page `/pms/crm` (`src/pages/pms/PMSCrm.tsx`): connection card, contacts/open-deals/matched-guests metrics, recent activity from `integration_logs`, portal deep links, embeds `HubSpotIntegrationCard bare`.
- Hooks: `src/hooks/useHubspotCrm.ts` — React Query (`["hubspot", ...]`, 5-min staleTime, `retry: false`), `useHubspotCapability()` for gating, `logMessageToHubspot()` fire-and-forget.
- Guests: `GuestHubspotPanel` renders as a **secondary, read-only** block below native data, and returns null when off/unhealthy/unmatched.
- Message logging is **default OFF**, stored as `owner_integrations.config.message_log_properties` (array of property ids). Per-message "Also log to CRM" checkbox uses `force: true`. Logging never blocks or fails a native send.
- Edge actions added to the isolated `hubspot-api`: `get_metrics`, `get_contact_summary`, `get_sync_log`, `set_message_logging`, `log_message_event`. No direct HubSpot calls anywhere else.
