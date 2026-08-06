# ROL'OS Dashboard — Room Plan Timeline

Rework the ROL'OS dashboard calendar into a Protel/RoomRaccoon-style **Room Plan**: one row per unit, continuous booking bars across the nights, hover tooltips with quick actions, drag-to-move reservations, and drag-across-empty-cells to create a booking. Desktop gets a much tighter vertical rhythm.

## Chosen direction

Protel "Room Plan" (image 448) as the structural base — one row per physical unit, colour-coded bars spanning nights — with NightsBridge's dark hover tooltip (image 447) and RoomRaccoon's compact toolbar (image 446).

Reason: the current grid renders bookings as separate chips inside each day cell, so a 5-night stay looks like 5 unrelated blocks. Bars make stays, gaps and back-to-back turnovers readable at a glance and are the only layout that supports drag-to-move.

## What changes on screen

**Toolbar (one compact row)**
- Left: `New Booking`, `Restrictions`, view switch `Room Plan | Week | Month`.
- Right: date nav, `Today`, `Jump`, `Booked days` toggle.
- Legend moves into a small popover behind an info icon (currently a full wrapped row).

**Above the grid: a single status strip**
Arrivals / Departures / In-house / Needs attention become four compact counters in one row. Clicking a counter expands that list inline instead of three tall stacked cards. Attention count stays highlighted.

**Room Plan grid**
```text
              Mon 4   Tue 5   Wed 6   Thu 7   Fri 8   Sat 9
Sea View  ────────────────────────────── room type header (rate + availability)
  Unit 1     [ M. Botha · 3 nights ────────]      [ Lead ]
  Unit 2                      [ RU · J. Smit ──────────────]
  Unit 3     (empty — click-drag to create)
```
- Rows: 26px tall (was ~48px of stacked chips), room-type header 22px.
- Bars: absolutely positioned over the day columns, starting mid-cell on check-in and ending mid-cell on check-out so turnovers read correctly. Status colour from the existing `getBookingStatusColor` map, channel badge for RU/OTA bookings, attention dot where `bookingHasSpecialIndicator` is true.
- Unassigned bookings (no unit) collect in an "Unassigned" row at the top of each room type, matching Protel's unassigned arrivals band.
- Today column highlighted with a vertical marker line.

**Hover tooltip (quick view)**
Dark card on hover after ~150ms: guest name, status, unit, dates + nights, pax breakdown, total and balance, channel. Footer buttons: Open, Check in / Check out (state-dependent), Modify, Cancel — the same handlers the booking sheet uses today.

**Drag to move**
- Drag a bar sideways to shift dates, or up/down to another unit of the same room type (cross-type drops are rejected with a toast).
- Ghost preview follows the pointer; conflicting targets turn red and refuse the drop.
- On drop, a small confirm dialog states the change ("Unit 2 → Unit 3, 4–7 Aug → 5–8 Aug") before anything is saved.
- Date shifts go through `modify-booking` (so channel push, availability re-block and commission recalculation stay intact). Unit-only reassignment writes `rolos_room_ids` directly, as the dashboard already does when repairing unit links.
- Locked cases stay read-only: cancelled, checked-out, and channel bookings whose PMS rejects modification.

**Drag on empty cells to create**
Click-drag across empty cells in a unit row selects a date span and opens the existing `ManualBookingDialog` prefilled with property, room type, unit and the dragged dates.

**Week / Month views**
Kept as-is behind the view switch, including the booked-days filter, week collapsing and portfolio grouping. Room Plan becomes the default on desktop; mobile keeps the current stacked view (no drag on touch), with tap-to-open unchanged.

## Technical notes

- New `src/components/pms/roomplan/` module: `RoomPlanGrid.tsx` (layout + columns), `RoomPlanBar.tsx` (bar + tooltip), `RoomPlanRow.tsx`, `useRoomPlanDrag.ts` (pointer-event drag state, no new dependency), and `roomPlanLayout.ts` (date→x offset, bar spans, overlap lanes).
- `src/pages/pms/PMSDashboard.tsx` gains the `"roomplan"` view mode and renders the new grid; existing `WeekCalendarGrid` / `MonthCalendarGrid` and all data queries stay untouched.
- Booking→unit resolution reuses the existing `bookingMatchesRoomType` / `roomsByType` helpers; no new query.
- `bookingCalendarHelpers.ts` gains bar-oriented helpers (span in nights, lane index) next to the current colour helpers.
- `ManualBookingDialog` gets optional `initialValues` (property, room type, room, check-in, check-out) — additive prop, existing call sites unaffected.
- Persistence uses the existing `modify-booking` edge function; no schema or backend changes.
- Density via a `--rolos-row-h` token so the mobile `.rolos-mobile` rules keep working.
