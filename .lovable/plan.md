# Channel Step Ledger — Phase 0 (safety rails only)

Add a default-off flag, a small PII-safe logging helper, and a documented list of canonical
step keys. Nothing in the wizard, Channels page, readiness scoring or RU calls changes.

## What ships

1. **Flag `channel_step_ledger_enabled`, default false**
   Stored as a row in the existing `ru_platform_settings` key/value table (same pattern as
   `user_management`), value `{"enabled": false}`. One migration inserting that row only —
   no new tables. Table already grants `authenticated` SELECT (admin/dev/fearless_leader
   policy) and `service_role` ALL, so both client and edge can read it.

2. **Readers**
   - Client: `src/lib/channelStepLedger.ts` — `isChannelStepLedgerEnabled(): Promise<boolean>`,
     reading the settings row and returning `false` on any error or missing row.
   - Edge: `supabase/functions/_shared/channelStepLedger.ts` — same helper for a
     service-role client.
   No caller uses either in this phase.

3. **Logging helper (no PII)**
   `logLedgerEvent({ propertyId, event, detail? })` in the shared edge module:
   structured `console.log` with a fixed `[channel-ledger]` prefix, swallows its own errors,
   and strips/never accepts credential-shaped fields (AccessKey, SecretKey, password, token,
   apikey) from `detail` before logging. No table write in Phase 0 — the existing
   `ru_api_log` is RU-exchange shaped, so a ledger write waits for its own table in a later
   phase.

4. **Canonical step keys (documentation only)**
   In `src/config/channelStepLedger.ts`, a `CHANNEL_LEDGER_STEP_KEYS` const listing:
   `identity`, `location`, `rooms`, `media`, `commercial`, `push_owner`, `keys`,
   `company_profile`, `signoff`, `pull_listings`, `publish`, `currency`, `entitlement`,
   `connect` — with a comment noting these mirror `rolosOnboardingMacros.ts` macro keys and
   are not wired to anything yet.

## Verification

- Flag helper returns false with the seeded row and with no row at all (unit test).
- Typecheck + build pass.
- `/pms/channels` and admin channel onboarding render exactly as today; no new network calls,
  no RU traffic (nothing calls the new helpers).

## Out of scope

Ledger table, edge actions, wizard integration, any readiness or rate-limit change.
