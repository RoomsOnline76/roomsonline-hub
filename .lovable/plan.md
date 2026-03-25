

# Fix Hostfully Booking Rate Matching (Room ID Mismatch)

## Problem

The booking checkout shows "On request" (no rates) because of a **room type ID mismatch** between the availability response and the booking page.

- The URL passes `roomTypeId=155e611a-...` which is the **Hostfully UID** (`pmsRoomId` from amenities)
- The Hostfully availability response returns `room_type_id: 6fcaf88a-...` which is the **database table ID** (`hostfully_room_types.id`)
- These don't match, so the room lookup fails silently and cost = 0

## Root Cause

In `supabase/functions/hostfully-api/index.ts` line 1031:
```javascript
room_type_id: roomType.id,  // DB table ID (6fcaf88a-...)
```

But the booking page uses `pmsRoomId` (the Hostfully UID `155e611a-...`) as the canonical room ID everywhere.

## Fix

Two changes to ensure matching works:

### 1. Hostfully edge function: use `hostfully_room_id` as `room_type_id`

In `supabase/functions/hostfully-api/index.ts` at line 1031, change:
```javascript
room_type_id: roomType.hostfully_room_id,
```

This aligns the availability response with what the booking page expects (`pmsRoomId`).

### 2. Add alias fallback in the same response

Also add the DB table ID as an alias so other consumers still work:
```javascript
room_type_aliases: [roomType.id],
```

## Files

| Action | File |
|--------|------|
| Modify | `supabase/functions/hostfully-api/index.ts` |

