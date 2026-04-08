

# Add "Channel Managers" Category to Admin Keys & PMS Control

## Overview
Create a new "Channel Managers" section in both `/admin-keys` (AdminKeys.tsx) and `/dev/pms` (DevPMS.tsx), and move existing channel/distribution systems into it. Add new entries for channels not yet in the system config (Booking.com, Expedia, Agoda, Google Hotels, Lekkeslaap).

## Changes

### 1. `src/lib/pmsSystemsConfig.ts` — Add missing channels + category flag

Add a `category` field to `PMSSystemConfig`: `'pms' | 'channel_manager'`.

Mark existing systems as channel managers:
- `hyperguest` → `category: 'channel_manager'`
- `hotelbeds` → `category: 'channel_manager'`
- `rentalsunited` → `category: 'channel_manager'`
- `profitroom` → `category: 'channel_manager'`
- `nightsbridge` → `category: 'channel_manager'`
- `airbnb` → `category: 'channel_manager'`

Add new channel manager entries:
- `booking_com` — "Booking.com", "Global OTA — rates, availability, and reservation sync"
- `expedia` — "Expedia", "Expedia Group — lodging availability, rates, and booking management"
- `agoda` — "Agoda", "Agoda OTA — rates, availability, and reservation distribution"
- `google_hotels` — "Google Hotels", "Google Hotel Ads — surface rates on Google Search & Maps"
- `lekkeslaap` — "Lekkeslaap", "South Africa's leading accommodation platform"

All new entries: `deploymentStatus: 'planned'`, `category: 'channel_manager'`.

Add helper exports:
```typescript
export const CHANNEL_MANAGER_SYSTEMS = VISIBLE_PMS_SYSTEMS.filter(s => s.category === 'channel_manager');
export const PMS_CATEGORY_SYSTEMS = VISIBLE_PMS_SYSTEMS.filter(s => s.category !== 'channel_manager');
```

### 2. `src/pages/AdminKeys.tsx` — Split into two sections

**Before** (single "Property Management Systems" section with all cards):

**After**:
- **"Property Management Systems"** section — contains only PMS cards (Benson, Channex, Checkfront, Cloudbeds, Guesty, Hostfully, RoomKey, RoomRaccoon, ROL'OS, etc.)
- **"Channel Managers"** section (new) — contains: Airbnb, Booking.com, Expedia, Agoda, Google Hotels, Lekkeslaap, NightsBridge, Rentals United, Profitroom, HyperGuest, HotelBeds

Move existing render calls (Airbnb, NightsBridge, HotelBeds, Rentals United, Profitroom) from PMS section into the new Channel Managers section. Add `renderPlaceholderPMSCard` calls for the 5 new channels (Booking.com, Expedia, Agoda, Google Hotels, Lekkeslaap).

### 3. `src/pages/DevPMS.tsx` — Add category grouping

Split the single system list into two visual groups using the `category` field:
- **"Property Management Systems"** heading — filter `PMS_CATEGORY_SYSTEMS`
- **"Channel Managers"** heading — filter `CHANNEL_MANAGER_SYSTEMS`

Each group retains the existing card rendering logic (connections table, status badges, credential editors).

### 4. Database — `pms_tracker_status`

Insert tracker rows for the 5 new channel managers so they appear in progress tracking:
```sql
INSERT INTO pms_tracker_status (system_type, status, integration_status, has_docs)
VALUES 
  ('booking_com', 'No Action', 'coming_soon', false),
  ('expedia', 'No Action', 'coming_soon', false),
  ('agoda', 'No Action', 'coming_soon', false),
  ('google_hotels', 'No Action', 'coming_soon', false),
  ('lekkeslaap', 'No Action', 'coming_soon', false)
ON CONFLICT (system_type) DO NOTHING;
```

## Files

| File | Change |
|---|---|
| `src/lib/pmsSystemsConfig.ts` | Add `category` field, 5 new entries, helper exports |
| `src/pages/AdminKeys.tsx` | Split into PMS + Channel Managers sections |
| `src/pages/DevPMS.tsx` | Group systems by category |
| Database | Insert 5 tracker rows |

