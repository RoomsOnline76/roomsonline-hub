

# Fix Embed Rate/Availability Mismatch & Hide Zero-Availability Rooms

## Problem

Two issues:

1. **Embed page shows wrong rates/availability** compared to admin calendar. Root cause: the `pms_availability_cache` has entries keyed by BOTH active and inactive `hostfully_room_types` IDs. The embed's ID mapping via `hostfully_room_id` picks up stale inactive entries alongside active ones, and last-write-wins produces inconsistent data. For example, "Studio" has cache entries under both `5a11a26c` (inactive, 0 units, R1,175) and `7260ec2d` (active, 3 units, R1,949) — whichever processes last determines what the guest sees.

2. **Admin calendar shows "Template" room** (and similar) with zero availability across all dates. These should be hidden.

## Solution

### 1. Fix embed cache lookup (`src/pages/EmbedProperty.tsx`)

Stop mapping via `hostfully_room_id` (which points to the old inactive entry). Only use the active room type's own `id` for cache lookups. When both active and inactive cache entries exist, prefer the active one (which has correct data from the latest sync).

**Change in `fetchPmsCache` (~line 190):**
- Remove the `hostfully_room_id` mapping that causes stale inactive cache entries to be included
- Only map `room.id → room.id` for active room types
- This ensures only the freshest cache data (keyed by the current active ID) is used

### 2. Hide always-sold-out rooms from embed (`src/pages/EmbedProperty.tsx`)

After building `gridRooms`, filter out any room where every date in the visible range has `null` rate (SOLD). This removes rooms like "Template" that never have availability.

**Change in `gridRooms` memo (~line 275):**
- Add a `.filter()` after the `.map()` to exclude rooms where all `ratesByDate` values are `null`

### 3. Hide zero-availability rooms from admin calendar (`src/pages/CalendarAccommodation.tsx`)

In `calendarRoomData`, after building the room list, filter out rooms where availability is 0 across ALL visible dates.

**Change in `calendarRoomData` memo (~line 1006):**
- After the room data mapping, add a filter: if a room's `availability` object has all values ≤ 0 (or is empty), exclude it from the result

## Files to change

| File | Change |
|------|--------|
| `src/pages/EmbedProperty.tsx` | Remove `hostfully_room_id` from cache ID mapping; filter out always-SOLD rooms from `gridRooms` |
| `src/pages/CalendarAccommodation.tsx` | Filter out room types with zero availability across all visible dates from `calendarRoomData` |

