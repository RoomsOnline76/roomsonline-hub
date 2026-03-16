

## Plan: Channel Manager Updates, ROL'OS API Cards, and Status Dropdown Fix

This plan covers four distinct changes across three pages.

---

### 1. `/rolos/channels` — Add Lekkeslaap & NightsBridge channels, simplify connect dialog

**ChannelLogo.tsx** — Add two new channel entries:
- `lekkeslaap`: label "Lekkeslaap", orange color, initials "Lk"
- `nightsbridge`: label "NightsBridge", teal color, initials "NB"

**ChannelCard.tsx** — Add descriptions for new channels.

**ConnectChannelDialog.tsx** — Remove API credential fields (username, password, API key, etc.) from all channels. Keep only the appropriate Property ID field per channel:
- `booking_com`: "Hotel ID"
- `airbnb`: "Listing ID"
- `expedia`: "Property ID"
- `agoda`: "Hotel ID"
- `google_hotels`: "Partner ID"
- `lekkeslaap`: "Property ID"
- `nightsbridge`: "Property ID" (bbid)

**Database migration** — Add `lekkeslaap` and `nightsbridge` to the `channel_name` enum.

---

### 2. `/admin/integrations` (AdminKeys.tsx) — ROL'OS section: Add channel API cards

Under the existing ROL'OS section, add a new subsection: **"Channel API Credentials"**. This will contain accordion cards for each OTA channel (Booking.com, Expedia, Agoda, Google Hotels, Airbnb, Lekkeslaap, NightsBridge). Each card will have:
- Channel-specific configuration fields (API key, secret, hotel ID, partner ID, etc.) — these are the **platform-level** credentials that ROL'OS uses to connect on behalf of properties
- A Save button that persists to a new `rolos_channel_api_config` table

**New table: `rolos_channel_api_config`**
```
id uuid PK
channel_name text (booking_com, expedia, etc.)
config jsonb (stores API key, secret, endpoint URL, etc.)
is_active boolean default false
created_at, updated_at timestamps
```
RLS: admin/dev only.

**ROL'OS Internal API card changes:**
- Replace the hardcoded "In Development" badge with the `IntegrationStatusDropdown` component (same as other PMS cards), allowing status changes (planned, in_development, in_testing, deployed, parked)
- Remove `PMSProgressToggles` component from the ROL'OS card (implementation progress milestones don't apply)
- In the "Planned / In Progress" section, make items interactive — each badge becomes clickable/draggable to mark as completed (move from "Planned" to "Deployed Capabilities")

For the planned items, store their completion status in `pms_tracker_status` additional_info JSONB or a simple local state backed by the existing tracker data.

---

### 3. `/admin/integrations` — Google Maps & reCAPTCHA status dropdown not saving

**Root cause:** The `IntegrationStatusDropdown` updates `pms_tracker_status` via `.update().eq('system_type', systemType)`. For Google Maps (`google`) and reCAPTCHA, if no row exists in `pms_tracker_status`, the update matches zero rows and silently fails.

**Fix in `IntegrationStatusDropdown.tsx`:** Change the update to an **upsert** — if no row exists, insert one; if it does, update it. Use `.upsert()` with `onConflict: 'system_type'`:
```ts
const { error } = await supabase
  .from('pms_tracker_status')
  .upsert({
    system_type: systemType,
    integration_status: newStatus,
    is_production: isProduction,
    updated_at: new Date().toISOString()
  }, { onConflict: 'system_type' });
```

This ensures rows are created on first status change for any system type.

---

### 4. Files to modify

| File | Change |
|------|--------|
| `src/components/pms/channels/ChannelLogo.tsx` | Add lekkeslaap, nightsbridge entries |
| `src/components/pms/channels/ChannelCard.tsx` | Add descriptions for new channels |
| `src/components/pms/channels/ConnectChannelDialog.tsx` | Remove credential fields, keep only property ID per channel |
| `src/components/pms/IntegrationStatusDropdown.tsx` | Change `.update()` to `.upsert()` |
| `src/pages/AdminKeys.tsx` | Add channel API config cards in ROL'OS section; replace hardcoded badge with IntegrationStatusDropdown; remove PMSProgressToggles; make planned items interactive |
| **New:** `src/components/integrations/RolosChannelApiCards.tsx` | New component for channel API credential cards |
| **Migration** | Add `lekkeslaap`, `nightsbridge` to `channel_name` enum; create `rolos_channel_api_config` table |

