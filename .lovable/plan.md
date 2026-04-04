

# Fix "One Bedroom" Showing Zero Availability When Stock Exists

## Root Cause

Two compounding issues:

1. **Stale PMS cache**: The `pms_availability_cache` for ONE26ON M was last fetched April 3rd. It shows `available_units: 0` for "One bedroom" on dates where the actual Hostfully/Fluent Living site now shows availability (e.g., April 5-6, from April 18). The cache is simply out of date.

2. **Live refresh doesn't override stale cache**: The embed page's live ARI refresh (line 267) has a guard `!updated[matchedRoom.id]` — it only fills in rooms that are **completely missing** from the cache. Since "One bedroom" HAS cache entries (just with wrong `available_units: 0` values), the live data never overwrites them.

3. **Incomplete cache coverage**: Only 4 of 8 room types have any cache data at all. One of the 4 is the deleted "Template" room. The Hostfully sync isn't fetching all room types.

## Fix

### Change 1 — Live refresh should ALWAYS override cache data (EmbedProperty.tsx ~line 267)

Remove the `!updated[matchedRoom.id]` guard. When live data is fetched, it should **always** update the cache map, overriding stale entries. The live data is more authoritative than the cache.

However, the current live fetch only returns a single boolean `available` + `minRate` per room (not per-day). To properly override, we need to:
- When live data says `available: true` for a room that the cache shows as fully SOLD, update those cache entries to show availability
- When live data says `available: false`, keep the cache SOLD entries

### Change 2 — Live per-day data should override cache per-day data (EmbedProperty.tsx ~line 258-284)

Enhance the live refresh merge logic: for rooms that have BOTH cache data and live data, merge live per-day availability into the cache map. If the live response includes `rooms_available_per_night` detail, use that to correct specific dates.

### Change 3 — Store per-day live availability (pmsLiveAvailability.ts ~line 76-103)

The `LiveRoomRate` type currently only stores `available: boolean`. Enhance it to also return per-day availability data (`availableByDate: Record<string, number>`) so the embed can do per-day corrections.

## Files to change

| File | Change |
|------|--------|
| `src/lib/pmsLiveAvailability.ts` | Add `availableByDate` and `ratesByDate` fields to `LiveRoomRate`, populated from `rooms_available_per_night` and `rate_types` |
| `src/pages/EmbedProperty.tsx` | Remove `!updated[matchedRoom.id]` guard; merge live per-day data over stale cache entries instead of skipping rooms that already have cache |

