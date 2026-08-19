---
name: HubSpot Owner Add-on
description: Owner-scoped, free, opt-in HubSpot CRM add-on — owner_integrations table, isolated hubspot-api edge function, no PMS coupling
type: feature
---
HubSpot is **not** a PMS. It is an owner-level CRM add-on: included free, no billing/plan gating, opt-in only (default disabled), one portal per owner covering the whole portfolio.

- Storage: `public.owner_integrations` (`owner_id`, `service`, `enabled`, `portal_id`, encrypted `access_token`, `sync_status`, `last_sync_at`, `last_error`, `config`), unique per owner+service, RLS owner-scoped plus admin/dev/fearless_leader.
- All HubSpot traffic goes through the isolated `hubspot-api` edge function (actions: `get_status`, `save_credentials`, `set_enabled`, `disconnect`, `test_connection`, `upsert_company`, `upsert_contact`, `create_or_update_deal`, `sync_owner`). Tokens are encrypted with `encrypt_sensitive_text` and never returned to the client.
- Tokens are verified against HubSpot before being persisted; every sync action is gated by `enabled && credentials present` and answers 409 `skipped: true` otherwise.
- UI: `HubSpotIntegrationCard` (onboarding wizard company-profile step + ROL Account settings). Client events via `src/lib/hubspotEvents.ts` are fire-and-forget.
- Hard constraint: never couple HubSpot to PropertyForm PMS logic, calendar, `fetchPmsAvailability`, `pms_mappings` or booking availability.
