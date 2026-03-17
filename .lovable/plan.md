

## Plan: Collapse Single-Room Type Rows in PMS Dashboard

### Problem
For properties like Latter Days where each room type has exactly **1 physical room**, the dashboard renders two rows per type:
1. **Header row** — room type name + rate + availability (useful)
2. **Room row** — repeats the name with "(Dungeon)" or "(3 Bedroomed Holi...)" but shows no rates, just booking bars (redundant)

This doubles the vertical space and confuses users. The rate display itself is correct (R2,650 for the house, R650/pp for Dungeon).

### Solution
When a room type has exactly **1 room**, merge the booking bar rendering into the header row itself and skip the individual room row. Only show individual room sub-rows when a room type has 2+ physical rooms.

### Changes to `src/pages/pms/PMSDashboard.tsx`

**Both `MonthRoomTypeRows` and `RoomTypeSection` (week view):**

1. If `typeRooms.length === 1`, render booking bars directly in the header row cells (alongside rate + availability info) and do NOT render the individual room row beneath.
2. If `typeRooms.length > 1`, keep current behavior: header row for rates, then individual room rows for booking bars.
3. Keep the unassigned bookings row logic unchanged.

This is a rendering-only change — no data fetching or rate logic changes needed.

### Files to Modify

| File | Change |
|------|--------|
| `src/pages/pms/PMSDashboard.tsx` | `MonthRoomTypeRows` (~line 1131) and `RoomTypeSection` (~line 1277): conditionally merge booking bars into header row when single-room type; skip sub-row rendering |

