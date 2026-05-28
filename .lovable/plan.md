## Goal
Add a new "TourPlan" channel manager card to the Admin Integrations (/integrations) page with milestone trackers. TourPlan is a travel technology platform (PHP API library at `shineklbm/tourplan`). No account or API docs exist yet, so the card is a placeholder with all milestones incomplete.

## Files to Modify

### 1. `src/lib/pmsSystemsConfig.ts`
- Add `tourplan` entry to `ALL_PMS_SYSTEMS` array:
  - `key: 'tourplan'`
  - `name: 'TourPlan'`
  - `description: 'Tour operator and travel technology platform'`
  - `category: 'channel_manager'`
  - `deploymentStatus: 'planned'`
  - `hasCustomCard: true` (so it renders in AdminKeys)

### 2. `src/components/pms/channels/ChannelLogo.tsx`
- Add `tourplan` to `CHANNEL_CONFIG`:
  - `label: "TourPlan"`
  - `color: "bg-sky-600"` (distinct from existing channels)
  - `initials: "TP"`

### 3. `src/components/ApiMilestones.tsx`
- Add `tourplan` to `pmsIntegrationStatus` record with all milestones set to `false`:
  - `auth: false` — no account or credentials yet
  - `healthCheck: false`
  - `pullAvailability: false`
  - `syncIn: false`
  - `pushBooking: false`
  - `liveMonitor: false`

### 4. `src/pages/AdminKeys.tsx`
- Add a TourPlan management card in the Channel Manager section (after Rentals United or ProfitRoom). Since there is no account yet, the card is a **placeholder/coming-soon** design:
  - Card title: "TourPlan" with ChannelLogo
  - Badge: "Planned"
  - Description: brief note about TourPlan being a tour operator platform
  - **ApiMilestones** component rendered with `systemType="tourplan"`
  - A note block: "No API account or documentation available yet. TourPlan integration is on the roadmap. GitHub reference: shineklbm/tourplan."
  - No credential form fields (since no account exists)
  - Optional: "Request Early Access" button (visual only, no-op for now)

### 5. `src/pages/connect/ConnectIntegrations.tsx` (optional — include if it fits the distribution model)
- Add TourPlan to `DISTRIBUTION_CHANNELS` array:
  - `name: "TourPlan"`
  - `flow: "ROL'OS → TourPlan → Tour Operator Network"`
  - Desc and features based on what a tour operator platform typically offers

## Technical Notes
- No database migration needed (pms_tracker_status is queried dynamically; the row will auto-create when toggled)
- No edge function needed (user explicitly said build later)
- No secrets needed
- Card follows the exact same pattern as existing channel manager cards (e.g., ProfitRoom, Rentals United)
- Milestone tracker uses the existing `ApiMilestones` component — zero new UI primitives

## Out of Scope
- Edge function for TourPlan API (user explicitly deferred)
- Credential forms (no account exists)
- Database schema changes
- pms_tracker_status row seeding (will populate on first render if missing)