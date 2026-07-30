## What I verified first

- **Credentials are stored in three places and they disagree.**
  - Platform secrets `RENTALS_UNITED_API_KEY` / `RENTALS_UNITED_API_SECRET` exist (these are what the API actually uses — the loader prefers them).
  - `pms_credentials` (used by Admin → API Keys) holds a **placeholder** value (19 chars, starts with "conf"), not a real key.
  - `rolos_channel_api_config` (the card in PMS Control) holds **real-looking AccessKey/SecretKey plus a username/password in plain text**, and its row is `is_active = false`. Nothing reads this row.
- **PMS Control card is stale**: description still says "sandbox, pre-certification", status `in_development`, `is_production = false`, and it has no link to the certification console. The Integrations page card is the correct one and already links to `/admin/integrations/rentals-united`.
- **Milestones are empty because no suite has ever run**: `ru_cert_runs` has 0 rows. The milestone matrix is derived from those runs, so every marker shows "never run". The current "Test Connection" button calls `health_check` directly and records nothing.
- **User management is parked in data**: `ru_platform_settings.user_management = { enabled: false }`. The console's Users tab, `create_user` and `fill_company_details` are gated behind that flag.
- **Readiness checker failures are real, and two of them can never pass as built:**
  - `has_zip_code` — no unit has `address_postal_code`, and `properties` has no postal-code column at all, so the payload always falls back to `'0000'` and the mandatory check fails for every property.
  - Photo minimum — several units (all Fonteinhutte units: 1–2 images) fall below the 10-photo rule even though the property gallery has plenty; unit payloads don't pool property images.
  - `has_space` / `has_floor` currently pass on defaults (50 m² / floor 0), which is a soft mis-report worth surfacing.

## Plan

### 1. Align the RU card in PMS Control with Integrations
- Update the Rentals United entry in `src/lib/pmsSystemsConfig.ts`: description becomes "Channel manager and distribution platform — XML API + GC API (live credentials, certification in progress)", status moves to `in_testing`.
- Set `pms_tracker_status` for `rentalsunited` to match (`in_testing`, production flag per the granted access).
- Both cards render the same status label, environment and connection summary.

### 2. Certification console link on both cards
- Add an "Open certification console" button to the RU card in PMS Control (`DevPMS.tsx`) pointing at `/admin/integrations/rentals-united`.
- Keep and restyle the existing link on the Integrations card so the two match visually (same label, same icon).

### 3. Replace "Test connection" with a recorded certification check
- Remove the ad-hoc `health_check` "Test Connection" button in Admin → API Keys (RU section) and put a shared **"Run certification check"** action on the RU card in PMS Control, the Integrations card and the API Keys section.
- The action calls `ru-cert-portal` `run_suite` (read-only suite) instead of a bare health check. That writes a row to `ru_cert_runs` with per-step results, so the milestone matrix updates automatically as steps pass.
- The button reports a compact result inline (passed / total, first failure) and links straight through to the console run detail.
- Milestone matrix in the console gets a live refresh after a run and a per-milestone "last passed" timestamp so progress is visible without re-opening the tab.

### 4. Enable RU user management
- Flip `ru_platform_settings.user_management` to `{ enabled: true }` with a note recording that RU activated the ROLOS PMS profile.
- Un-park the Users tab in the certification console: enable the "Create RU sub-user" and "Fill company details" forms, show `Pull_ListMyUsers_RQ` results, and record created users in `ru_owner_accounts`.
- Remove the "Parked — awaiting Rentals United confirmation" copy wherever it appears.

### 5. Consolidate RU keys and secrets (one source of truth)
- Platform secrets stay the single source of truth for the XML API (that is what the running code uses and what authenticated successfully).
- Clear the plaintext key/secret/username/password out of `rolos_channel_api_config` for `rentalsunited` — those values must not sit in a readable table.
- The PMS Control credential block for RU becomes read-only: shows "Managed via platform secrets", the endpoint URL, and a verification state driven by the certification check rather than editable password fields.
- `pms_credentials` for `rentalsunited` keeps only non-secret metadata (endpoint, environment, active flag); the placeholder key value is removed so nothing can silently fall back to it.
- If the account uses different keys than the ones currently in secrets, they get updated through the secure secret form — I'll prompt for that when we get there.

### 6. Fix the readiness checker
- **Postal code:** add a postal/ZIP field on the property (General tab), have the RU payload use unit postal code → property postal code → code parsed from the address line (e.g. "6675" in "Groot Jongensfontein 6675"), and only fail the check when none of those resolve. Backfill the six RU-enabled properties from their address text.
- **Photos:** when a unit has fewer than 10 images, top up the RU payload from the property gallery (same pooling idea already used for hero images) before failing the check; the scorecard then reports only genuine shortfalls.
- **Space / floor:** stop passing these on silent defaults — report "using default (50 m²)" as a warning-level check so owners know it is estimated, and add size/floor inputs to the unit form.
- Re-run the scorecard for the six RU-enabled properties and list what remains as a genuine owner data gap versus what the fixes cleared.

## Technical notes

- Files touched: `src/lib/pmsSystemsConfig.ts`, `src/pages/DevPMS.tsx`, `src/components/pms/ChannelCredentialEditor.tsx`, `src/pages/AdminIntegrations.tsx`, `src/pages/AdminKeys.tsx`, `src/components/integrations/RuCertificationConsole.tsx`, `supabase/functions/ru-cert-portal/index.ts`, `supabase/functions/push-property-to-ru/index.ts`, `supabase/functions/_shared/ruReadiness.ts`.
- New shared component for the "Run certification check" button so the three surfaces behave identically.
- Data changes: `ru_platform_settings` (enable user management), `rolos_channel_api_config` (strip secrets), `pms_credentials` (drop placeholder), `pms_tracker_status` (status alignment), property postal-code backfill. A schema migration adds the postal-code column.
- No change to the RU XML contract or the locked adapter regions.
