

# Add HyperGuest PMS Card with Tracking Metrics

## Problem
HyperGuest has a fully built edge function adapter (`hyperguest-api`) with capabilities for availability, prebook, reservations, and static data — but it's completely missing from the `ALL_PMS_SYSTEMS` config in `pmsSystemsConfig.ts`. This means it doesn't appear in the PMS Control page (`DevPMS.tsx`), has no tracking card, and is invisible to the admin UI.

Additionally, it needs the same `pms-implementation-master.json` entry as other PMS systems.

## What will be done

### 1. Register HyperGuest in `pmsSystemsConfig.ts`
Add a HyperGuest entry to `ALL_PMS_SYSTEMS` between Hostfully and HotelBeds (alphabetical):
- Key: `hyperguest`
- Name: `HyperGuest`
- Description: `Distribution channel connectivity — enables ROLOS → HG → Booking.com and other OTAs`
- `hasCustomCard: true`
- `deploymentStatus: 'in_development'` (BYOS / adapter testing phase)

This immediately makes it visible on the PMS Control page with connection tracking, sync status, and enable/disable controls.

### 2. Add HyperGuest to `pms-implementation-master.json`
Add a PMS rules entry:
- Property fields: name authoritative, description/location/images not_available (HyperGuest is a distribution channel, not a content PMS)
- Room types cache: full, amenities_seed: false
- Notes: Distribution channel adapter (PULL model). Routes bookings via HG to OTAs like Booking.com.

### 3. Add tracking metrics card component
Create `src/components/pms/HyperGuestDetails.tsx` — a dedicated details card (similar pattern to `HostfullyRoomDetails`) that shows:
- **Connection health**: Last health check result, API environment (sandbox/production)
- **Capability matrix**: Visual grid of the 12 capabilities from the adapter (live availability, prebook, create booking, etc.)
- **Sync metrics**: Counts from `pms_room_types_cache` and `pms_rate_types_cache` for HyperGuest-connected properties
- **Distribution channel info**: "ROLOS → HyperGuest → Booking.com" flow diagram badge
- Quick actions: Health check, Fetch static data, Test availability

### 4. Wire HyperGuest card into DevPMS page
When a HyperGuest connection exists, show the `HyperGuestDetails` component below the connections table (same pattern as other systems with `hasCustomCard`).

## Files Changed

| File | Change |
|---|---|
| `src/lib/pmsSystemsConfig.ts` | Add HyperGuest entry to `ALL_PMS_SYSTEMS` |
| `src/config/pms-implementation-master.json` | Add HyperGuest PMS rules block |
| `src/components/pms/HyperGuestDetails.tsx` | New — tracking metrics card with capability matrix, health check, sync stats |
| `src/components/pms/index.ts` | Export `HyperGuestDetails` |
| `src/pages/DevPMS.tsx` | Import and render `HyperGuestDetails` for HyperGuest system cards |

