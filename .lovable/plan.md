# HubSpot owner CRM add-on — finish Phase 1

Most of Phase 1 is already built and live. This plan closes the three real gaps rather than rebuilding what exists.

## Already in place (verified)

- `owner_integrations` table exists with `owner_id`, `service`, `enabled`, `portal_id`, encrypted `access_token` / `refresh_token`, `last_sync_at`, `sync_status`, `last_error`, `config`, timestamps, unique per owner+service, RLS with owner-only access and service-role full access.
- `hubspot-api` edge function is deployed and isolated. It supports `get_status`, `save_credentials`, `set_enabled`, `disconnect`, `test_connection`, `upsert_company`, `upsert_contact`, `create_or_update_deal`, `sync_owner`, reads credentials only server-side, never returns tokens, and maps reservation status onto deal stages (enquiry/provisional → confirmed → checked out / cancelled) with per-owner overrides in `config`.
- Onboarding shows the free opt-in HubSpot card straight after the company-details step; portfolio/owner settings (`ROL Account`) shows the same card with enable toggle, status, last sync, Test connection, Force sync and Disconnect. The token is never rendered after saving.
- No PMS code, calendar, `fetchPmsAvailability`, `pms_mappings` or billing logic is involved.

## Gap 1 — Trade vs Direct segmentation (missing)

Nothing in the schema records whether a guest or reservation is trade (agent/booker) or direct.

- Add `is_trade boolean not null default false` to the guest record and to bookings.
- Backfill: mark trade where a booking already has a linked agent/booker record, otherwise direct.
- Keep it derived-on-write: when a booking is created or edited with a booker/agent attached it is trade; a plain guest booking stays direct.
- Send it to HubSpot as a contact and deal property (`rol_trade_or_direct`) so lists can be segmented, and surface it as a small Trade / Direct chip on the guest record.

## Gap 2 — Sync only fires from one screen

Today only the manual booking dialog pushes to HubSpot, so channel bookings, web bookings and later status changes (confirm, check-in, cancel) never reach the CRM.

- Add an isolated `cron-hubspot-sync` function that, for each owner with HubSpot enabled, picks up bookings and guests changed since `last_sync_at` and pushes contacts and deals through `hubspot-api`. This covers every booking source and every status change without touching a single PMS file.
- Run it on a schedule, and keep Force sync in the settings card as the manual equivalent.
- Company details: push through the same delta sweep when the owner's company record changes, so `PropertyForm` stays untouched.

## Gap 3 — Operator guidance

- Add a short help article and TOBI answer explaining HubSpot is a free, optional owner-level add-on, how to get a Private App token, and that it never affects availability, rates or the calendar.

## Technical notes

- One migration: two `is_trade` columns plus backfill, no changes to `owner_integrations`.
- `cron-hubspot-sync` uses the service role, reads `owner_integrations` for gating (`enabled` and credentials present), and calls the existing actions — no new HubSpot transport code.
- Deploy `hubspot-api` (with the trade property) and `cron-hubspot-sync` at the end, then verify with a live `test_connection` and a delta run.

## Out of scope

- Billing, plan gating, OAuth refresh flow (Private App token only in v1), custom object mapping beyond pipeline stage overrides.
