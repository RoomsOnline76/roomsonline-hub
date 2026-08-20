# Half-day arrival / departure look on the Dashboard

Make a stay read the same way everywhere: the arrival day is only occupied from mid-day, and the departure day only until mid-day. Today the Dashboard's normal (week / month) view and the Room Plan both draw bars that fill whole day cells, so an arrival and a departure on the same date look like a full double booking.

## What changes

**Normal view (week + month grids)**
- A stay's first day cell starts its bar at the cell's midpoint instead of its left edge.
- A stay's last night extends the bar half a cell past its right edge, into the departure day.
- Both open ends get a diagonal slice so the shading matches the stay-date picker ("snake") language already used across ROL'OS.
- Result: back-to-back stays share the changeover day visually — one bar in its left half, the next in its right half — instead of stacking or looking double-booked.

**Room Plan view**
- Booking bars shift half a column right at check-in and end half a column into the departure column, with the same diagonal ends.
- Bars clipped by the visible window (stay starts before / ends after the range) keep a square edge so nothing implies a half day that isn't there.
- Drag-to-move, drag-to-create, hover cards, lanes and clash detection keep their current behaviour — only the drawn geometry changes.

No data, booking logic or channel behaviour is touched.

## Technical notes

- `src/index.css`: add `.rol-bar-half-in` / `.rol-bar-half-out` (and their combination) using `clip-path` wedges, sitting next to the existing `.rol-stay-*` picker classes so the diagonal angle is shared.
- `src/pages/pms/PMSDashboard.tsx`: the four booking-bar renderers that already compute `isStart` / `isEnd` (week room rows, month type rows, month room rows) switch from `left-0.5` / `right-0.5` to inline `left: 50%` / `right: -50%` offsets plus the wedge classes. Unassigned-booking bars keep full-cell geometry.
- `src/components/pms/roomplan/RoomPlanBar.tsx`: replace the fixed `colWidth * 0.28` insets with midpoint maths — start `(startCol + 0.5) * colWidth`, end `(startCol + cols + 0.5) * colWidth`, collapsing to the column edge when `geometry.clippedStart` / `clippedEnd` — and apply the wedge classes for the unclipped ends. `roomPlanLayout.ts` lane assignment stays as-is (touching bars still don't overlap).
- Verify with Playwright screenshots of `/pms/dashboard` in both Room Plan and week/month views, including a changeover date.
