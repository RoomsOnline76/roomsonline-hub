# Fix "double booking" left behind after a room-plan move

## What actually happened

There is no second reservation in the database. Nicola Bamford's Seesig stay (ROL-SEE-0553, 1 Apr – 7 Sep) exists exactly once, and the move did update it: `rolos_room_ids` and `room_type_id` now point at the new unit.

What was not updated is the stay's room line in `rolos_booking_rooms` — that row still points at the old unit and old room type. So two surfaces now disagree, and the pages that read the room line show the stay in its old row as well as the new one. That reads on screen as a duplicate.

Confirmed from the data: the booking row carries unit `7291cd2b…` / type `f50d510b…`, while its single room line still carries unit `2cca2995…` / type `83c13a5a…`.

Why it shows as two bars on Rooms: the Rooms page merges the booking's own unit ids with the ids from the room lines (a union), so a stay whose line is stale occupies both units at once. The same union runs on Housekeeping, and the channel availability push falls back to the room lines too — meaning the old unit's nights are still being closed upstream.

## The fix

1. **A move rewrites the room line, not just the booking.** After a successful drag-move (unit change, room-type change, or date shift), update the stay's `rolos_booking_rooms` row(s) to the new unit and room type. Single-room stays get their one line re-pointed; multi-room stays only re-point the line that matches the unit being moved, so group bookings stay intact.
2. **The booking row wins.** Where a page merges unit sources, stop unioning: when `rolos_room_ids` is set, that is the truth and the room lines are ignored for placement. Room lines are only used to fill in units for stays that have none. This alone removes the visual double for any stay whose line drifted in the past.
3. **Availability push uses the same rule** so the vacated unit is released upstream and the newly sold one is closed.
4. **Heal the existing drift.** A one-off repair re-points room lines whose unit disagrees with the booking's own unit, so today's leftovers (starting with ROL-SEE-0553) clear without manual editing, and the affected properties get an availability re-push queued.

## Technical notes

- `src/pages/pms/PMSDashboard.tsx` (`handleRoomPlanMove`): after the `bookings` update, update `rolos_booking_rooms` for that booking (`room_id`, `room_type_id`) — match the line by the origin unit id when the stay has several lines, else update the single line. Keep the existing `queueChannelRatesSync` call.
- `src/pages/pms/PMSRooms.tsx` (~line 265) and `src/pages/pms/PMSHousekeeping.tsx` (~line 203): replace the `Set([...rolos_room_ids, ...linkedIds])` union with "use `rolos_room_ids` when non-empty, otherwise the linked ids".
- `supabase/functions/push-property-to-ru`: in `loadBookingBlocks`, apply the same precedence — the `rolos_booking_rooms` fallback only applies to bookings with no `rolos_room_ids`.
- Repair: a data fix that sets each `rolos_booking_rooms.room_id`/`room_type_id` to the parent booking's values where the parent has exactly one unit id and the line disagrees, limited to active (non-cancelled) stays; then re-queue the channel delta for Seesig and Tidal Pools.
- No schema change.
