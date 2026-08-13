# Show blocked dates in the Dashboard room plan and Rooms grid

## What's wrong

Oester's blocked nights are saved correctly — the database holds stop-sell rows for Oester (Seesig) on 16–23 Aug 2026 with zero units available. The problem is purely display:

- The Dashboard's default "Room plan" view does not read blocked dates at all. Only the older Week and Month views do, which is why the same block appears there but not on the compact multi-calendar.
- The Rooms page never loads blocked dates, so nothing can render.

## What to build

1. Load blocked dates for the visible date window on the Rooms page, and pass the already-loaded blocks into the Dashboard room plan (single-property and each portfolio property).
2. Render a blocked night distinctly in both grids: a hatched/greyed cell with a small "Blocked" label, and a tooltip naming the room and date range. Blocked shading sits under booking bars so an existing booking still reads normally on top.
3. Treat blocked nights as unavailable in the grids' own counts: they reduce the free-unit count shown per night and never read as "available" in the free/occupied summaries.
4. Prevent accidental bookings over a block: drag-to-create and drag-to-move onto a blocked night is refused with a clear message ("Oester is blocked on 18 Aug — unblock those dates first").
5. Blocks are stored per room-type name and Seesig currently has two room-type records named "Oester", so matching is by name for every room type carrying that name, ensuring the block shows regardless of which duplicate the grid renders.

## Technical notes

- Source table: `property_availability` (`room_type` holds the room type *name*, plus `date`, `is_stop_sell`, `available_units`). Keys are built as `name-yyyy-MM-dd`, the same convention the Week/Month grids already use.
- `src/pages/pms/PMSDashboard.tsx`: pass the existing `overrideMap` (and per-property `propData.overrideMap`) into `RoomPlanGrid`.
- `src/components/pms/roomplan/RoomPlanGrid.tsx`: accept an optional `overrideMap` plus room-type name lookup, add blocked-cell styling and the create/move guard alongside the existing group-block handling.
- `src/pages/pms/PMSRooms.tsx`: add a scoped `property_availability` query for the current property/portfolio and visible range; feed it to `RoomTypePlanGrid`.
- `src/components/pms/rooms/RoomTypePlanGrid.tsx` and `roomTypePlanLayout.ts`: add a `blocked` flag to the plan cell so shading and availability counts share one source.
- No schema or write-path changes; blocking/unblocking continues through the existing bulk stop-sell dialog.
