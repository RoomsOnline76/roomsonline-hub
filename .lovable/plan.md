# Hide archived / duplicate room types on the Room Type Plan

## What's wrong

Dassiesingel and Tidal Pools have clean physical units (4 each), but the Room Type Plan draws a row for every room type record — including stale duplicates left behind by earlier syncs.

Confirmed in the database for Dassiesingel: 9 room type rows are still marked active, but only 4 of them have a physical unit attached. BOSBOK, DASSIE and STEENBOK each exist twice as active (one with a unit, one empty), and GRYSBOK has an extra empty active record. Those empty duplicates are the "deleted/cancelled rooms" showing up as rows with no units. A further 11 Dassiesingel records are already inactive. Tidal Pools' types are clean at type level.

Root cause: the room-type sync only ever creates or reactivates types from the Property Overview source — it never retires records that no longer match, so renamed/removed rooms accumulate. The Rooms page also falls back to the unfiltered type list (inactive included) when the active query returns empty, and the grid renders any type regardless of whether it has units.

## What will change

1. Room Type Plan only shows room types that are genuinely live: active, and having at least one physical unit (unless the property legitimately has no units at all, in which case nothing changes for greenfield setups).
2. Duplicate types with the same name are collapsed to one row — the record that owns the units wins.
3. The sync retires stale types: any active type that no longer matches the Property Overview list and has no units or bookings is set inactive, so the clutter stops regrowing.
4. Remove the "fall back to all types including inactive" branch on the Rooms page so archived types can never leak back into the view.
5. One-off cleanup: deactivate the existing empty duplicate records for the affected properties.

## Technical notes

- `src/pages/pms/PMSRooms.tsx`: drop the `allTypes` fallback for `setRoomTypes`; keep `allTypes` only for `autoAssignBookings` legacy matching. Derive the visible types by name-normalised dedupe, preferring the id referenced by `rolos_rooms`, and filter out zero-unit types when the property has any units.
- `src/components/pms/rooms/roomTypePlanLayout.ts` (`buildRoomTypePlan`): skip types with no rooms rather than emitting an empty row, so the grid stays consistent for both single and portfolio mode.
- `src/lib/pmsRoomTypeSync.ts`: after the insert/update pass, compute the set of matched type ids and deactivate unmatched active rows that have no `rolos_rooms` and no bookings referencing them; return a `retired` count.
- Data cleanup via an update statement setting `is_active = false` on the duplicate empty Dassiesingel type ids.
