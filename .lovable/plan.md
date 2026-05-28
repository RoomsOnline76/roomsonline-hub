# HyperGuest Sandbox Integration Plan

## 1. Store sandbox auth token as a secret
Add `HYPERGUEST_AUTH_TOKEN` via the secrets tool (prompting you to paste `1c0eeaa6d13b44eeb657403ac8f239fe`). The adapter will read this when `active_environment = sandbox`. A second secret `HYPERGUEST_AUTH_TOKEN_PROD` will be reserved (added later when prod credentials arrive).

## 2. Update HyperGuest adapter (`supabase/functions/hyperguest-api/index.ts`)
Current adapter points at `sandbox-api.hyperguest.com/v1`. Replace with the certified endpoints:

- Static data: `https://hg-static.hyperguest.com/hotels.json`
- Search (availability/prebook): `https://search-api.hyperguest.io/2.0/`
- Book (create/modify/cancel/list): `https://book-api.hyperguest.com/2.0/`

Changes:
- Replace `BASE_URLS` map with per-purpose host map (`static`, `search`, `book`); same URLs for sandbox and production (HG uses a single host with a sandbox-scoped token).
- Inject `Accept-Encoding: gzip, deflate` on every fetch.
- Set booking request `fetch` timeout to **300 s** via `AbortController`; on timeout, fall back to **Booking List API** to reconcile status before returning.
- Read auth token from `HYPERGUEST_AUTH_TOKEN` (sandbox) or `HYPERGUEST_AUTH_TOKEN_PROD` (production) based on `active_environment` instead of from the credentials row (still allow override if a credential row is set).
- Respect BAR rate flag when parsing rate plans (don't silently downgrade to net/sell).
- Add `action: "health_check"` hitting the static endpoint for hotel 19912.

## 3. Add sandbox/production toggle on the HyperGuest card
`src/pages/AdminKeys.tsx` currently renders HG via `renderPlaceholderPMSCard`. Replace that single line with a dedicated `renderHyperguestCard()` modeled on the Cloudbeds/Hostfully cards:

- Header with `ChannelLogo` + status badge
- `<EnvironmentToggle systemType="hyperguest" currentEnvironment={trackerData.hyperguest?.active_environment || 'sandbox'} onEnvironmentChange={handleEnvironmentChange} />`
- Embed existing `<HyperGuestDetails />` component below the toggle (cache metrics + capability matrix + health check)
- "Test connection" button → calls `hyperguest-api` `health_check`
- Note line: "Certification property: 19912"

The existing `handleEnvironmentChange` already persists `active_environment` to `pms_tracker_status`, so no new handler needed.

## 4. Register demo property 19912
Insert a row in `pms_tracker_status` (and `channel_credentials` if needed) so the adapter has a property to target during certification:

- `system_type = 'hyperguest'`
- `active_environment = 'sandbox'`
- `additional_info.demo_property_id = '19912'`
- `credentials.hotel_id = '19912'`

Done via the insert tool (no schema change required — tables already exist).

## 5. Milestone tracker update (`src/components/ApiMilestones.tsx`)
Add/flip HyperGuest milestones to reflect new state:

- ✅ Sandbox credentials received
- ✅ Demo property 19912 registered
- ✅ Sandbox/Production toggle live
- ⏳ Search-API certification (availability + prebook)
- ⏳ Book-API certification (create / modify / cancel / list)
- ⏳ 300 s timeout + Booking List fallback verified
- ⏳ Production credentials & go-live

## 6. Verify
- Deploy `hyperguest-api`
- `curl_edge_functions` → `health_check` against property 19912; confirm 200 + gzip
- Confirm toggle persists by flipping it in the UI and re-reading `pms_tracker_status`

## Technical notes
- Single token for the sandbox tenant means the existing `ChannelCredentialEditor` UI stays as-is (optional override).
- Production endpoints are identical hosts; only the token differentiates environments, matching HG's documented model.
- No DB schema changes — `pms_tracker_status.active_environment` and `additional_info` JSONB already exist.

Files touched:
- `supabase/functions/hyperguest-api/index.ts` (endpoint + timeout + fallback)
- `src/pages/AdminKeys.tsx` (new `renderHyperguestCard`)
- `src/components/ApiMilestones.tsx` (milestone updates)
- One `pms_tracker_status` row insert
- Secret: `HYPERGUEST_AUTH_TOKEN`
