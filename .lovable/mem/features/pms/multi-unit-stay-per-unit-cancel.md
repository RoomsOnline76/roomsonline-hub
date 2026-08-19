---
name: Multi-unit stays — per-unit pax and per-unit cancel
description: rolos_booking_rooms line status, per-unit occupancy on room-plan bars, cancel-booking cancel_room_line_ids scope
type: feature
---

A stay spanning several units keeps one `rolos_booking_rooms` line per unit. Lines carry
`status` (`active` | `cancelled`), `cancelled_at`, `cancellation_reason`; every read of
lines (calendars, housekeeping, rooms, rates, details grid) MUST exclude `cancelled`.

Room-plan bars show the pax of the line for that row (`useBookingRoomLines.linesByBooking`),
never the booking-wide totals, and label "1 of N units". Cancel on a bar of a multi-unit
stay offers "Just this unit" vs "The whole booking".

`cancel-booking` accepts `cancel_room_line_ids`:
- lines must belong to the booking and still be active, else 400 `LINE_NOT_FOUND`;
- cancelling every remaining line is treated as a full booking cancellation;
- a partial (unit) cancel never pushes a cancel to the channel or external PMS — channels
  cannot partially withdraw a reservation — and skips the refund register (refunds stay on
  the folio);
- the booking is re-derived from surviving lines: pax sums, `total_price` minus the cancelled
  lines' `rate_charged`, `rolos_room_ids` pruned, `room_type_id` retargeted, and a
  `unit_cancelled` entry appended to `modification_notes`.
