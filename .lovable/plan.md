# Fix "Booked days" filter on the ROLOS dashboard calendar

## What's wrong

The "Booked days" button on the ROLOS dashboard only works when the calendar is showing a **portfolio** (multiple properties). In single-property mode:

- the button is not rendered at all, and
- even if it were, the single-property week and month calendars are handed the full date range, so unbooked days are never removed.

## What to change

1. Rename the state to a property-agnostic "show only booked days" flag and render the toggle for both single-property and portfolio mode.
2. Add a single booked-day predicate that works in both modes:
   - portfolio: any member property has a live booking touching that date,
   - single property: the property's own bookings touch that date.
   Cancelled and no-show bookings continue to be ignored, so only live bookings keep a day visible.
3. Apply the filter to the single-property views:
   - Week view: pass the filtered date list to the week grid.
   - Month view: filter each week's dates, and drop weeks that end up empty.
4. Empty-state messaging: when the filter is on and nothing in the visible range is booked, show "No booked days in this week/month." instead of an empty grid — same wording already used in portfolio mode.
5. Keep the toggle independent of week collapsing, so a collapsed week stays collapsed and an expanded week shows only its booked days.

## Technical notes

- All edits are in `src/pages/pms/PMSDashboard.tsx` (presentation only — no data-fetch or booking-logic changes).
- `hidePortfolioEmptyDays` becomes `showOnlyBookedDays`; `hasPortfolioBookingOnDate` becomes `hasBookingOnDate`, falling back to the local `bookings` array when `isPortfolioMode` is false.
- Single-property grids currently receive `dates` (week) and `weekChunks` (month) unfiltered at lines ~1757-1789; these get the filtered equivalents.
- `bookingTouchesDate` is reused unchanged, so the definition of "booked" stays consistent with the rest of the dashboard.
