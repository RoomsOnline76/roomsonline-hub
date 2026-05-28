## Goal
Add a new "Beds24" channel manager card to `/integrations` with milestone trackers. Beds24 has a documented API (https://api.beds24.com/v2/) but no account/credentials yet — card is a placeholder with all milestones off until credentials are provisioned. Edge function adapter is out of scope for this turn.

## Files to Modify

### 1. `src/lib/pmsSystemsConfig.ts`
Add Beds24 entry to `ALL_PMS_SYSTEMS`:
- `key: 'beds24'`
- `name: 'Beds24'`
- `description: 'Cloud-based property management and channel manager — REST API v2 (api.beds24.com/v2)'`
- `category: 'channel_manager'`
- `deploymentStatus: 'planned'`

### 2. `src/components/pms/channels/ChannelLogo.tsx`
Add to `CHANNEL_CONFIG`:
- `beds24: { label: "Beds24", color: "bg-fuchsia-600", initials: "B24" }`

### 3. `src/components/ApiMilestones.tsx`
Add `beds24` entry to `pmsIntegrationStatus` with all six milestones `false` (no account yet).

### 4. `src/pages/AdminKeys.tsx`
Add `{renderPlaceholderPMSCard("Beds24", "beds24", "Cloud PMS + channel manager with REST API v2. API account and token-based auth pending — edge function adapter will be wired once credentials are available. Docs: https://api.beds24.com/v2/")}` next to the other channel-manager placeholder cards (after the HyperGuest/TourPlan group).

## Technical Notes
- Reuses existing `renderPlaceholderPMSCard` helper — same pattern as TourPlan card just added.
- No database migration (pms_tracker_status row auto-creates when toggled).
- No secrets, no edge function in this turn.

## Out of Scope
- `beds24-api` edge function (token auth, refresh-token rotation, getProperties, getInventory, postBookings) — build later when credentials arrive.
- Credential form fields.