# Fix booking moves + flag double bookings in Command Centre

## 1. Why the Nicola Bamford / Witmossel drag does nothing

Verified in code and data:

- The move validator in `useRoomPlanDrag` / `RoomPlanGrid` rejects any drop whose target row belongs to a **different room type** (`drag.target.roomTypeId !== drag.roomTypeId` returns `false`).
- Witmossel is a **single-unit room type** (1 unit at Seesig), so there is no second valid row inside its own type. Every drop lands on another room type and is refused.
- A refused drop is silent: the ghost turns red on release and the gesture is dropped with no toast and no dialog, so it reads as "drag not working".
- Nicola Bamford's Witmossel stays are also long (Apr–Sep, Sep–Oct) and overlap each other, so even a same-type drop would be blocked by the occupancy check.

### What changes

- Allow **cross-room-type moves**: a bar may be dropped on any unit row of the same property. The confirmation dialog gains a "Room type: Witmossel → Oester" line and warns when the target type's rate or occupancy differs from the booking's.
- Keep genuine blocks (target unit already occupied for those nights, cancelled/checked-out bookings) but make them **explain themselves**: on release of an invalid drop, show a toast naming the reason and the conflicting guest, instead of nothing.
- Cross-type moves write `room_type_id` alongside `rolos_room_ids`, and re-queue the channel availability delta so both the vacated and the newly sold room type are pushed upstream.
- Long bars that start before the visible window keep their length: the move keeps the stay length unchanged (already the rule) and the dialog states the unchanged nights.

## 2. Command Centre — double-booking flag with re-allocation suggestions

New "Overbookings" card at the top of `/pms/command-centre`, above the occupancy cards, only rendered when clashes exist:

- **Flag:** high-severity (destructive) card with a count of clashing nights and affected properties, so it reads as an alarm rather than a note.
- **Clash list:** one row per conflict — property, room type, night range, and the reservations involved (guest, reference, dates, status, channel). Clicking a reservation opens the existing booking quick-view sheet.
- **Re-allocation suggestions:** for each clashing reservation, up to three candidate room types in the same property that are free for the **whole stay** and closest in price. Each suggestion shows the unit name, the nightly rate, the delta versus the current rate (e.g. `R1 450 · +R50/night`), and whether occupancy still fits the party size.
- **Action:** "Re-allocate" applies the chosen suggestion through the same move path as the drag (unit + room type update, availability delta re-queued), with a confirmation dialog. Suggestions that don't fit the party or have no rate are shown but marked, never auto-applied.
- **Empty state:** when there are no clashes the card collapses to a single green "No double bookings" line.

## Technical notes

- `src/components/pms/roomplan/RoomPlanGrid.tsx`: relax `validateMove` to same-property (drop the room-type equality test), return a structured reason instead of a boolean so the grid can toast it, extend `RoomPlanMovePayload` with `roomTypeId` / `roomTypeChanged`, and surface the type change in the confirm dialog.
- `src/components/pms/roomplan/useRoomPlanDrag.ts`: carry the invalid-reason through the drag state and expose it on release.
- `src/pages/pms/PMSDashboard.tsx` (`handleRoomPlanMove`): update `room_type_id` when it changed and invoke the RU availability delta after a successful move.
- New `src/lib/roomClashes.ts`: pure helper that takes bookings, room types and unit counts and returns clashes plus candidate re-allocations — shared by the Rooms overbooked chip and the new Command Centre card, so one definition of "double booked".
- New `src/components/pms/command/OverbookingAlertCard.tsx`: the card, list and suggestion UI; `src/pages/pms/PMSCommandCentre.tsx` fetches unit counts per room type (currently it only has availability rows) and renders the card.
- Rates for suggestions come from the existing rate resolution already used by the dashboard grid (`rolos_rate_plan_season_rates` with the cache fallback) — no new pricing logic.
