# HubSpot Owner Add-on (free, optional, fully isolated)

Add HubSpot as an owner-level CRM add-on: opt-in, free for every owner, one portal per owner covering their whole portfolio, and completely outside the PMS/availability/booking path.

## What the owner sees

**During onboarding** — a new skippable section, "HubSpot CRM (included free)", placed after company details and next to the channel key step:
- Toggle: Enable HubSpot integration (off by default)
- Portal ID + Private App Access Token fields (token masked, never re-displayed after save)
- "Test connection" button with clear pass/fail feedback
- Saving only flips `enabled = true` after a successful test; the section can be skipped entirely

**In owner / portfolio settings** — a "HubSpot" card modelled on the existing channel-accounts tab:
- Enable / disable toggle
- Connection status, portal ID, last sync time, last error
- Test connection, Force sync, Disconnect (clears credentials, sets `enabled = false`)

**Sync behaviour (v1, event driven)**
- Company details created or meaningfully changed → company upsert
- New reservation / guest → contact upsert + deal create-or-update with status mapped to a pipeline stage
- Nothing syncs unless the add-on is enabled and credentials exist
- Every call goes through the isolated edge function; no HubSpot call from the browser

## Technical detail

**Migration** — `public.owner_integrations` (`owner_id`, `service`, `enabled`, `portal_id`, `access_token`, `refresh_token`, `last_sync_at`, `sync_status`, `last_error`, `config jsonb`, timestamps, `UNIQUE(owner_id, service)`), with GRANTs (`authenticated`, `service_role`), RLS enabled, owner-scoped policies plus admin/`fearless_leader` parity via `has_role`, and an `updated_at` trigger. Tokens are stored through the same encrypt helper used for channel keys (`encrypt_sensitive_text`), and a client-safe read path exposes status fields only — never the token.

**Edge function `hubspot-api`** — new isolated function, same shape as `benson-api` / `checkfront-api` (`{ success, data, error }`, CORS, JWT validated in code, Zod-validated body). Actions: `test_connection`, `upsert_company`, `upsert_contact`, `create_or_update_deal`, `sync_owner`. Credentials are read server-side from `owner_integrations`; requests go through the HubSpot connector gateway pattern with the owner's Private App bearer token, and non-OK provider responses are surfaced with status + body.

**Frontend**
- `src/hooks/useOwnerIntegration.ts` — status read, save-after-test, toggle, disconnect, force sync (status only, no tokens)
- `src/components/integrations/HubSpotIntegrationCard.tsx` — shared card used by both the onboarding section and the settings tab, using existing Collapsible/density patterns and semantic tokens
- Wired into the ROLOS onboarding wizard as an optional section and into portfolio settings as a new card next to the channel accounts tab
- Help content / TOBI prompt text updated to describe it as a free, optional owner add-on

**Event hooks** — thin, additive calls at the existing company-details save and reservation-created paths that fire-and-forget into `hubspot-api` and no-op when disabled. No changes to `PropertyForm` pricing/PMS logic, calendar components, `fetchPmsAvailability`, `pms_mappings`, or any adapter file under adapter lock. No billing or plan gating anywhere.

**Order of work**
1. Migration (approval step)
2. `hubspot-api` edge function + deploy
3. Hook + shared card
4. Onboarding section and settings tab
5. Event-driven company/reservation sync calls
6. Verify: enable, test, save, force sync, disconnect; confirm no PMS/calendar/booking regressions
