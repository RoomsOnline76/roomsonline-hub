

# Fix: Command Centre — Availability Grid & Room Resolution (Definitive)

## Verified Root Causes (from database queries)

### Problem 1: THREE43 ON B shows truncated UUIDs instead of names
The cache stores Hostfully UUIDs as `external_room_type_id`. Current code builds `nameMap` keyed by `rt.id` from `hostfully_room_types`. But 5 of 10 cache UUIDs (155e611a, 3230c408, 754008e4, c548858d, cab4520a) have **no matching row** in `hostfully_room_types` at all — they were deleted from Hostfully entirely. The code falls through to the truncated UUID display (`155e611a…`).

Additionally, 4 of the remaining 5 UUIDs (54f6b7fc=1BD, 921faf08=2BD, 3c85a983=Compact Studio, 6fcaf88a=Studio) match inactive hostfully rows but the `inactiveKeys` set correctly contains them by UUID — so these ARE being filtered. Only `f6fcb3d3=3BD` is active and shows correctly.

**Fix**: For Hostfully properties, only show cache rows whose `external_room_type_id` matches an **active** `hostfully_room_types.id`. Use an allowlist approach instead of a blocklist. Cache rows with UUIDs that don't exist in any room type table are stale/orphaned and should be hidden.

### Problem 2: Latter Days shows wrong room types in grid
Cache has slugs: `dulux-pondok`, `holiday-house`, `one-bedroom-suite`, `petite-hotel-room`, `two-bedroom-suite`. But the property's current room inventory (per user's choice) has only ONE active room type: "3 Bedroomed Holiday House". None of the cache slugs match this. The cache data is from a previous configuration that no longer exists.

**Fix**: Same allowlist approach — build a set of valid room type identifiers (UUID + slug) from active room types. Only show cache rows that match.

### Problem 3: ONE26 ON M works because its cache UUIDs directly match active hostfully_room_types IDs
This confirms the allowlist approach is correct — it naturally works for ONE26.

### Problem 4: Live fetch still fails with `propertyId: undefined`
The runtime error shows `propertyId` is undefined in the request. Looking at the `triggerLiveFetch` code, it sends `propertyId: pid` which looks correct. But the error comes from a different call path — likely `pmsLiveAvailability.ts` line 52 which **skips** `roomsonline` properties (returning empty), meaning the error must come from the Command Centre's `triggerLiveFetch` being called for a property where `pid` is somehow empty. Actually, the error log shows `property_id` in the request body (not `propertyId`), suggesting there's another caller. Let me check — the edge function log shows `"property_id": "cd424b0b..."` which is the SANDBOX HOTELBEDS property. The Zod schema expects `propertyId` (camelCase) but the request sends `property_id` (snake_case). The Command Centre's `triggerLiveFetch` correctly uses `propertyId: pid`, but there might be another code path calling with `property_id`.

Actually the runtime error says `received: "undefined"` for `propertyId`, meaning `propertyId` is not in the body at all. But the edge function log shows `property_id` is present. The edge function's Zod schema requires `propertyId` (camelCase) but gets `property_id` (snake_case) — so `propertyId` is indeed undefined. This is a different code path — the CalendarAccommodation page sends both `property_id` and `propertyId` (line 480-481). The Command Centre correctly sends `propertyId`. The runtime error is from CalendarAccommodation or another page, not the Command Centre.

### Problem 5: PMSRooms page shows Dungeon
`fetchData` fetches ALL `rolos_rooms` without filtering by room type `is_active`. Dungeon's physical room is linked to an inactive room type but the room itself isn't filtered out.

## Plan

### File: `src/pages/pms/PMSCommandCentre.tsx`

**Replace blocklist with allowlist approach for room type filtering:**

1. After fetching rolos, hostfully, and amenities data, build an `activeRoomKeys` Set containing:
   - UUIDs of all active `hostfully_room_types` rows for the property
   - UUIDs of all active `rolos_room_types` rows
   - Slugified names of all active room types from both tables
   - IDs and slugified names from amenities JSONB (only for properties without hostfully/rolos types)

2. When filtering cache data, **only include** rows where `external_room_type_id` exists in `activeRoomKeys`. This replaces the current inactive blocklist approach.

3. Name resolution remains the same `nameMap` lookup, but now only active rows pass the filter so truncated UUIDs won't appear.

4. For the live-fetch fallback, check each property's `external_system` — only invoke `roomsonline-pms-api` for properties that are PMS-backed (not `manual` or `roomsonline` which is self-managed ROL). Use the correct adapter (`hostfully-api`, `hotelbeds-api`, etc.) based on `external_system`, similar to how `PropertyShowcase` does it.

### File: `src/pages/pms/PMSRooms.tsx`

**Filter physical rooms linked to inactive room types:**

In `fetchData`, after fetching rooms, filter out any room whose `room_type_id` references an inactive `rolos_room_types` row. Query all room types (active + inactive) to build an inactive set, then exclude those rooms from the display.

## Technical Detail

```typescript
// Build per-property allowlist of active room type keys
const activeRoomKeys = new Set<string>();

for (const rt of rolosResult.data || []) {
  if (rt.is_active) {
    activeRoomKeys.add(rt.id);
    activeRoomKeys.add(slugify(rt.name));
  }
}
for (const rt of hostfullyResult.data || []) {
  if (rt.is_active) {
    activeRoomKeys.add(rt.id);
    activeRoomKeys.add(slugify(rt.name));
  }
}
// Amenities fallback for properties with no active types in either table
for (const prop of propsResult.data || []) {
  const hasActiveTypes = (rolosResult.data || []).some(r => r.property_id === prop.id && r.is_active)
    || (hostfullyResult.data || []).some(r => r.property_id === prop.id && r.is_active);
  if (!hasActiveTypes) {
    // Use amenities as source of truth
    const rts = (prop.amenities as any)?.room_types || [];
    for (const rt of rts) {
      if (rt?.name) {
        activeRoomKeys.add(slugify(rt.name));
        if (rt.id) activeRoomKeys.add(String(rt.id));
      }
    }
  }
}

// Filter: only show cache rows matching active room types
const rows = cacheData
  .filter(r => activeRoomKeys.has(r.external_room_type_id || ""))
  .map(r => ({ ... }));
```

## Files to Change

| File | Changes |
|------|---------|
| `src/pages/pms/PMSCommandCentre.tsx` | Replace blocklist filtering with allowlist; fix live-fetch to use correct API per external_system |
| `src/pages/pms/PMSRooms.tsx` | Filter out physical rooms linked to inactive room types |

