# "Booked days" filter: strip everything unbooked (single + portfolio)

## What's still wrong

The toggle currently only removes date columns, and in portfolio mode it uses a portfolio-wide test:

- A date stays visible if **any** property in the portfolio has a booking that day, so properties with nothing booked (e.g. Dassiesingel) still render a full grid of rates — the whole point of the filter is lost.
- Room rows with no booking in the visible range still render, so the grid shows open/priced cells around the one booked row (e.g. ELF, LEERVIS, WILDEPERD next to the booked GEELSTERT).
- Properties/weeks that end up with nothing booked still render headers.

## What to change (presentation only)

1. **Per-property date filtering in portfolio mode.** Each property's grid gets its own booked-day list computed from that property's bookings only, instead of the shared portfolio-wide list. A property with no booked days in the range is not rendered at all (no header, no badge).
2. **Row filtering when the toggle is on.** Restrict the grid to room types (and rooms within a type) that actually carry a live booking on one of the visible days. Room types with no booked room are dropped; this applies in single and portfolio mode.
3. **Week grouping in portfolio month view.** A week block renders only if at least one property has a booked day in it; the week header count and date span reflect the filtered days.
4. **Empty states.** Keep the existing "No booked days in this week/month." message and show it whenever the filter leaves nothing to render in the visible range, in both modes.
5. **Toggle stays independent of week collapsing**, and turning the filter off restores the full grid exactly as today.

## Technical notes

- All edits in `src/pages/pms/PMSDashboard.tsx`; `bookingTouchesDate` stays the definition of "booked" (cancelled/no-show excluded).
- Add a helper that, given a property's bookings and a candidate date list, returns `{ visibleDates, visibleRoomTypes, visibleRoomsByType }`; use it for the single-property path (own `bookings`) and per property in the portfolio path (`portfolioDataByProperty.get(prop.id).bookings`).
- Room membership is resolved via each booking's room/room-type linkage already used by `WeekCalendarGrid`; bookings that cannot be tied to a specific room keep their room type visible so they are never hidden.
- `hasBookingOnDate` becomes a property-scoped predicate; the portfolio-wide variant is kept only for the month-level "does this week have anything" check and the week booking-count badge.
- No changes to data fetching, rate resolution, or booking logic.
