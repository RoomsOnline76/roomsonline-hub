# Fix room-plan drag-and-drop, and flag real overbookings on Rooms

Two separate defects: moving a booking by dragging never reaches its confirmation, and the Rooms availability matrix hides genuine double bookings behind a plain "0".

## 1. Dashboard Room Plan — drag to another unit does nothing visible

Confirmed in the code: the booking bar is a `<button>` that both starts the drag (`onPointerDown`) and opens the booking sheet (`onClick`). A drag always ends with a click on that same button, so the booking detail sheet opens on top of the "Move this reservation?" dialog, and the confirmation is dismissed/unreachable — the move looks like it silently failed.

Changes:
- Suppress the bar's click when the pointer actually moved (drag gesture): track movement on the bar and skip `onOpen` for that gesture; a plain click with no movement still opens the booking.
- Have the drag hook expose whether the last gesture was a drag so the bar and the day-cell surface both ignore the trailing click.
- Guard the confirm dialog: while a move confirmation is pending, ignore booking-sheet opens so the dialog is always the top surface.
- Make the drop target reliable while dragging: the hover card that appears over a bar can sit under the pointer and break target detection. Close/disable hover cards for the duration of a drag and ignore non-row elements when reading the target row.
- Keep the existing rules unchanged: cross-room-type drops and overlapping targets stay invalid (red ghost, refused), cancelled/checked-out/no-show bars stay non-draggable, date shifts still route through `modify-booking` and unit-only changes still write `rolos_room_ids`.
- Add a failure toast when the confirmed move errors, and keep the dialog open on error instead of closing silently.

## 2. Rooms — flag overbooked nights loudly

Confirmed in the data: Witmossel has a single unit, and three NightsBridge stays share it — a 2 Apr → 8 Sep stay plus 13–15 Aug and 23–26 Aug. So those nights are sold twice. The matrix computes free units as `max(0, sellable − used)`, which clamps the surplus away: an overbooked night renders identically to a merely full night.

Changes:
- Stop clamping: the plan cell keeps `used` and an `overbooked` surplus (`used − sellable`) alongside `free`.
- Overbooked cells get their own top-severity treatment, distinct from sold-out: solid destructive fill, a white `-1` / `-2` style surplus figure, and a warning glyph so it reads at a glance across the grid.
- The night hover card leads with "Overbooked — 2 reservations for 1 unit" and lists the conflicting stays first (guest, dates, nights, status, source), each still click-through to the booking.
- The room-type row label shows a persistent overbooking badge with the count of affected nights in the visible window, so a collapsed row still surfaces the problem.
- An "Overbooked nights" summary chip appears in the Rooms toolbar when any visible night is oversold, and clicking it filters the matrix to the affected room types.
- The legend gains an "Overbooked" entry next to sold out / low availability.

## Technical notes

- `src/components/pms/roomplan/useRoomPlanDrag.ts` — return a `didDrag` ref/flag and reset it on gesture start; ignore targets without `data-row-key`.
- `src/components/pms/roomplan/RoomPlanBar.tsx` — swallow the post-drag click, disable the hover card while dragging.
- `src/components/pms/roomplan/RoomPlanGrid.tsx` — pass the drag flag down, block booking-sheet opens while `pendingMove` is set, keep the dialog open on save failure.
- `src/components/pms/rooms/roomTypePlanLayout.ts` — extend `PlanCell` with `used` and `overbooked`; add `cellSeverity`/`cellHeatClass` handling for the overbooked case (pure functions, unit-testable).
- `src/components/pms/rooms/RoomTypePlanGrid.tsx` — overbooked cell styling, hover-card ordering, row badge, legend entry.
- `src/pages/pms/PMSRooms.tsx` — toolbar overbooking chip and the room-type filter it drives.
- Presentation and client logic only: no schema, edge function or availability-push changes. Occupancy maths already counts imported `pending` stays, which is why these conflicts are visible.
