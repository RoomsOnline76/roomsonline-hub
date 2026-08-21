# Surface HubSpot CRM as a first-class ROL'OS capability

HubSpot stays a CRM adapter: everything below is additive, read-mostly, and non-blocking. Native guest messaging (templates + queue) remains the sole transactional source of truth and fallback.

## 1. Navigation

Add a **CRM** item to the Front Desk group in the ROL'OS sidebar, directly under Guests, using the existing `guests` module so it inherits the same role visibility (owner, admin, general manager, platform users). The item renders only when the HubSpot capability is on for the current scope — the add-on row exists and is enabled — so properties without HubSpot never see it. Same treatment in the mobile More sheet. Active state and routing follow the current nav patterns unchanged.

## 2. New CRM page (`/pms/crm`)

Dense, operational page in the ROL'OS shell:

```text
CRM · HubSpot                        [Open in HubSpot]
------------------------------------------------------
Connection      Last sync            Portal
Healthy         21 Aug 13:10         12345678
------------------------------------------------------
Contacts synced   Linked to guests   Open deals
        482               311              17
------------------------------------------------------
[Force sync now]  [View sync log]
Recent sync activity (last runs, status, message)
```

- Status card reuses the PMS adapter/system-health status visual language (badge + muted meta line), with the four states: not configured, disconnected, error, healthy.
- Counts come from the isolated edge function; anything the portal does not expose renders as a muted dash rather than a fabricated number.
- Disconnected/not-configured state explains that the portal token is set up on the existing HubSpot card in ROL Account settings and links there — no duplicate credential form.
- Force sync and sync log reuse the existing owner-integration actions and log table.

## 3. Guests enrichment (secondary only)

In the guest detail sheet, a collapsible **HubSpot** section below the existing ROL'OS content, shown only when the add-on is healthy and a contact match exists (by email). Read-only: contact owner, lifecycle stage, tags/lists, last few timeline events, open deals, and a "View full profile in HubSpot" deep link. No match or unhealthy portal → the section is absent (or a muted "Not linked" line); the Guests page never blocks, never waits on HubSpot, and the ROL'OS record always wins.

The Guests list gets at most a small muted HubSpot marker on rows already linked, driven by the same cached lookup.

## 4. Optional light message logging (default OFF)

- A per-property toggle "Log guest messages to HubSpot" in the CRM page settings row, default off.
- When on and the portal is healthy, selected message events (booking confirmed, pre-arrival, check-out) are projected as a HubSpot note/timeline engagement **after** the native dispatcher has done its job, via the existing fire-and-forget projection helper. Failures are logged only.
- Messaging UI gains one optional "Also log to HubSpot" checkbox on compose, visible only when healthy, default unchecked. The native dispatcher, queue, and templates are otherwise untouched.

## Guardrails

- No direct client-side HubSpot calls; every request goes through the isolated HubSpot edge function.
- No changes to booking flows, calendar, PMS adapters, or the native message dispatcher's success path.
- Credential storage, RLS, and role guards unchanged.

## Technical detail

- New `useHubspotCapability()` (React Query, 5 min stale) wrapping the existing `get_status` action, consumed by the sidebar, mobile nav, CRM page, and guest sheet from one cached entry.
- New edge-function actions on the existing HubSpot function: `get_metrics` (contact/deal counts + linked-guest count computed server-side), `get_contact_summary` (single contact by email: owner, lifecycle, lists, recent engagements, open deals), `log_message_event`. All keep the current opt-in gate returning `skipped: true` when off.
- New page `src/pages/pms/PMSCrm.tsx` + lazy route in `App.tsx`; nav entry in `PMSSidebar.tsx` (`pmsNavGroups`, module `guests`) with a capability filter also applied in `PmsMobileBottomNav.tsx`.
- New components: `HubspotStatusCard`, `HubspotMetricsRow`, `HubspotSyncLogTable`, `GuestHubspotPanel` (used in `PMSGuests.tsx` detail sheet).
- Per-property message-logging flag stored as a data-only column/config value; read by the messaging projection path, no PropertyForm changes.
- Strict TS, shadcn/Tailwind semantic tokens, `PMSBrandContext` respected, snake_case wire payloads.
