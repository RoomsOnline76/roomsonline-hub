

## Fix: Dungeon Room (and all ROL'OS rooms) Not Getting Rates

### Root Cause

In `Booking.tsx` line 686, the ROL'OS rate plan resolution path is guarded by:
```js
else if (!externalSystem || externalSystem === 'none')
```

This property has `external_system = 'roomsonline'`, which doesn't match. So it falls into the generic `else` block (line 662) that queries `pms_availability_cache` — which is empty for ROL'OS properties. The result: no availability data → no rate → "On request" for all rooms.

This regression was introduced when the previous fix added the `hasLinkedRolos` fallback inside the `!externalSystem || externalSystem === 'none'` block, but that block is never reached for `roomsonline` properties.

### Fix

| File | Change |
|------|--------|
| `src/pages/Booking.tsx` | Line 686: Add `'roomsonline'` to the condition: `else if (!externalSystem \|\| externalSystem === 'none' \|\| externalSystem === 'roomsonline')` — this ensures ROL'OS native properties enter the rate plan resolution path instead of the generic cache path |

This one-line fix restores rate resolution for all ROL'OS properties across every entry point (embeds, direct links, booking bar, ROL book page).

