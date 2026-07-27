## Plan

1. **Fix the booking detail sheet data context**
   - When a booking is selected in portfolio mode, pass the booking’s own `property_id` and that property’s rooms into the detail sheet instead of the currently selected single-property context.
   - This prevents guest/room/folio/notes actions from resolving against the wrong property context.

2. **Support opening bookings directly to Folio**
   - Add dashboard state for the booking sheet’s active tab.
   - Keep single click on a calendar booking opening **Details**.
   - Add double click on calendar booking bars to open the same booking sheet directly on **Folio**, where extras/charges can already be added.

3. **Improve notes visibility for bookings without guest profiles**
   - Booking `790F0E89` exists and has guest data, is paid/confirmed, but has no linked `rolos_guest_id`, no `special_requests`, and empty `rolos_room_ids`.
   - Update the Notes tab so booking-level modification history and comments still render even when no guest profile is linked.
   - Keep complaints disabled unless a guest profile exists, but do not hide booking notes/history behind guest-profile availability.

4. **Add portfolio week collapsing**
   - Add `collapsedWeeks` state for portfolio month view.
   - Make each portfolio week header a toggle button.
   - Default all weeks to expanded.
   - When collapsed, show a compact summary with the week date range and booking count.

5. **Add “hide empty days” toggle in portfolio view**
   - Add a portfolio-only toolbar toggle, default off.
   - When enabled, filter each displayed week to only dates that have at least one active booking across any portfolio property.
   - Skip weeks with no booked days when the filter is on.
   - Preserve the normal expanded/all-days view by default.

6. **Verify**
   - Check TypeScript/build signal for the dashboard file.
   - Use the dashboard preview to confirm booking selection opens details, double-click opens Folio, week headers collapse/expand, and the hide-empty-days toggle reduces the portfolio calendar.