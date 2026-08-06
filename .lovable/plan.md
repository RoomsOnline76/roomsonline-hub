# Rooms page: Room Type Plan, instant search and hover detail

Rework `/rolos/rooms` so it reads like the Protel Room Type Plan reference: a compact availability matrix at the top, rich hover detail everywhere, and a search box that finds any reservation in one keystroke instead of navigating to the dashboard.

## What the page becomes

Three stacked zones, all filtered by one toolbar.

```text
┌ Room Inventory ───────── [Portfolio|Single] [property ▾] [Refresh] [+ Add Room] ┐
│ [🔍 guest, room, ref…]  [Status ▾] [Room type ▾] [Sleeps ▾]  ← Aug 2026 W32 →   │
├ ROOM TYPE PLAN ─────────────────────────────────────────────────────────────────┤
│ Room type        Units │ Thu 06 │ Fri 07 │ Sat 08 │ Sun 09 │ Mon 10 │ …         │
│ Standard Room        4 │   3    │   3    │  [1]   │  [1]   │   3    │           │
│ Deluxe Room         15 │   6    │   6    │  [0]   │  [0]   │   4    │           │
├ TODAY IN HOUSE ─────────────────────────────────────────────────────────────────┤
│ guest rows (arrivals / in-house / departures) — click to open the booking       │
├ ROOMS ──────────────────────────────────────────────────────────────────────────┤
│ room cards with status, guest, sleeps badge, hover detail + actions             │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1. Room Type Plan matrix (new, top of page)

- Rows = room types, columns = 14 nights from the anchor date, with a week label above each Monday and prev/next/today arrows.
- Each cell shows **free units** for that type on that night (units minus overlapping reservations minus blocked/maintenance rooms).
- Heat colouring copied from the reference: red when 0 free, amber when 1 free or low, plain when comfortable, weekends and public holidays tinted, today's column marked with a left rule.
- Hover a cell → tooltip listing: free/total units, and for each reservation on that night the guest name, nights, and **guest count** (adults / children / teens / infants / pets), plus status. Clicking a guest line opens the booking sheet.
- Portfolio mode renders one matrix per property under its property heading.

### 2. Instant reservation finder

- One search field, debounced, matching guest name, email, phone, booking reference, room number/name and room type across the loaded window.
- Results appear as a compact list directly under the toolbar with dates, nights, room, pax and status; a single click opens the existing booking quick-view sheet (details + charges + check-in action). No page hop.
- Search widens beyond today: the page loads reservations for the visible 14-night window plus the next 60 days so future bookings are findable, not just in-house ones.
- Keyboard: `/` focuses search, `Esc` clears it.

### 3. Filters and visual cues on the room cards

- Filter chips for status (available / occupied / dirty / maintenance / out of order), room type, and minimum sleeps; each chip shows its live count, and the active filter also narrows the matrix rows.
- Room cards gain: a coloured status strip on the left edge, a `Users` badge with max occupancy, the current guest with dates when occupied, and hover detail showing the full guest breakdown and next arrival date.
- Edit / delete stay hover-revealed as today, plus a new hover "Open reservation" action when the room is occupied.
- Status change stays a single click via the inline select (unchanged behaviour).

## Technical notes

- New folder `src/components/pms/rooms/`:
  - `roomTypePlanLayout.ts` — free-unit computation per type per night, heat class resolution, week grouping. Reuses the date/holiday helpers already used by the dashboard.
  - `RoomTypePlanGrid.tsx` — the matrix, using `HoverCard` for the per-night tooltip.
  - `ReservationFinder.tsx` — search input plus result list.
  - `RoomCard.tsx` — extracted from the inline `renderRoomGrid` so `PMSRooms.tsx` stays small.
- `src/pages/pms/PMSRooms.tsx` keeps its existing data loading (`rolos_rooms`, `rolos_room_types`, `syncRolosRoomTypesFromOverview`, `autoAssignBookings`) and gains a windowed bookings query (`check_out_date >= window start`, `check_in_date <= window end`) selecting the extra columns the tooltips need: `guest_email`, `guest_phone`, `adults`, `children`, `teens`, `infants`, `pets`, `total_price`, `payment_status`, `special_requests`, `booking_reference`.
- Booking detail reuses `BookingQuickViewSheet` with the existing `CalendarBookingRow` shape — no new detail UI and no backend changes.
- Filtering, matrix cells and search results are all `useMemo` over the same in-memory booking list, so no extra round trips when typing or filtering.
- Mobile: the matrix scrolls horizontally with a sticky room-type column; filters collapse into a single row of scrollable chips, consistent with the existing ROL'OS mobile density rules.
