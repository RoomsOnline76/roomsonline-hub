

## Fix: Unified Rate Resolution for All Integration Flows

### Problem

All integration methods (booking bar, direct links, WordPress widget, full embed) eventually arrive at `Booking.tsx` (`/booking/${slug}`), but only the embed flow works because `EmbedProperty.tsx` pre-resolves rates and passes `embed_rate`, `roomTypeId`, and `roomTypeName` as URL parameters. The booking bar and direct links don't pass any of this — they rely on `Booking.tsx` to self-resolve rates, which fails due to room ID mismatches.

**Root cause in detail:**
- Room initialization (line 311) picks `roomTypes[0]` using IDs from `amenities.room_types` (e.g. `pmsRoomId` or a wizard-assigned ID)
- Synthetic availability generation (line 696) uses `hostfully_room_types.id` (UUID) for ROL'OS properties
- These IDs almost never match, so `calculateCost()` can't find the room in the availability data → totalCost = 0 → "On request"

### Fix Strategy

Make `Booking.tsx` properly self-resolve rates for **all** entry paths, not just embeds. Two changes:

**1. Room ID normalization in `Booking.tsx` (lines ~696-724, synthetic availability builder)**

When building synthetic availability from `hostfully_room_types` for ROL'OS properties, include the `room.name` as an alias so the name-based fallback matching (already at line 853) can find it. Also add the amenities `pmsRoomId` if it matches by room name.

**2. Room initialization fallback in `Booking.tsx` (lines ~311-323)**

When no `preSelectedRoomTypeId` is provided and the property has `hostfully_room_types` data, initialize the first room using the `hostfully_room_types` ID (which matches synthetic availability) instead of the amenities ID. This eliminates the mismatch at the source.

Specifically:
- After `hostfully_room_types` are fetched (via the existing `hfRooms` query in `calculateCost`), cross-reference the amenities room name → hfRoom ID
- In the synthetic availability builder, store aliases mapping amenities IDs to hfRoom IDs so matching succeeds regardless of which ID the room was initialized with

**3. Ensure ROL'OS path activates without `embedRate`**

The ROL'OS rate resolution at line 641 is gated by `isRolProperty || embedRate`. If `is_rol_property` is not set on some properties, the path is skipped. Add a secondary check: if the property has `hostfully_room_types` with `linked_rolos_id`, treat it as a ROL'OS property regardless of the flag.

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Booking.tsx` | (1) Expand ROL'OS detection to also check for hfRooms with linked_rolos_id; (2) Add room aliases (amenities IDs) to synthetic availability entries; (3) When initializing rooms without preSelectedRoomTypeId, prefer hfRoom IDs when available |

### What This Fixes

- Booking bar → `/booking/${slug}` → rates resolve correctly
- Direct links → `/property/${slug}` → booking page → rates resolve correctly  
- WordPress embed → `/embed/property/${slug}` → `/booking/${slug}` → continues working (already has embed_rate)
- Smart button → same as booking bar, now fixed
- All flows use one `Booking.tsx` checkout page with consistent rate resolution

