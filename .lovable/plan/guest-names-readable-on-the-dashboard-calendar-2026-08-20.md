# Guest names readable on the dashboard calendar

Today each booking bar in the multi-calendar is drawn per day cell, and the guest name is only
printed in the cell the guest checks in on. Since that cell now shows the diagonal half-day wedge,
the bar occupies only the right half of the cell and the name is squeezed to a few characters. If the
check-in falls before the visible date range, no cell prints a name at all, so a stay already in
progress shows as an unlabelled coloured band.

## What changes

1. **Name moves to the first full night.** The label prints on the day after check-in — a full-width
   cell — so it reads cleanly. The check-in half-cell keeps only its wedge and colour.
2. **One-night stays keep the label where they are.** With no full day available, the name stays on
   the check-in cell as it is now (the hover tooltip still carries the full detail).
3. **Stays that started before the visible range still get a name.** When the check-in day is not in
   view, the first visible day of that stay prints the name instead, so every band on screen is
   identifiable by eye.
4. **Same rule everywhere on the dashboard calendar:** month view room-type row, month view room
   rows, week view room-type row, week view room rows, and the "Unassigned" row.
5. The warning triangle for stays needing attention keeps riding along with the name, so it lands on
   the same cell as the label.

Nothing about bar geometry, colours, wedges, click/double-click behaviour or the Room Plan view
changes — the Room Plan already draws one continuous bar per stay and labels it correctly.

## Technical notes

- `src/pages/pms/PMSDashboard.tsx`: the five cell renderers currently gate the label on
  `isStart`. Replace that with a small shared helper (defined once in the file, alongside
  `getBookingBarTitle`) that answers "does this cell own the label?" given the booking, the cell
  date string and the visible date array:
  - `labelDate = max(check_in + 1 day, first visible date)`, clamped so it never reaches
    `check_out`; if the stay is a single night, `labelDate = check_in`.
  - the cell prints the label when `dateStr === labelDate`.
- Each renderer already has the visible `dates` / `weekDates` array in scope, so the first visible
  date is available without new props.
- Verification: on `/pms/dashboard` for a property with an in-progress stay and a mid-window
  check-in, confirm via a browser screenshot that both bars show the guest name, the check-in wedge
  is unlabelled, and a one-night stay still shows its name.
