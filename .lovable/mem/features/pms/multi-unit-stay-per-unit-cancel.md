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

Inbound channel modifications mirror the same rule: when Rentals United sends a reservation
with fewer `StayInfo` blocks, `syncRuStayUnits` cancels ONLY the dropped unit lines (status
`cancelled`, never deleted, reason "Unit withdrawn via Rentals United") and releases just
those units' nights; surviving units keep their blocks, and a unit that returns on a later
modification is reinstated to `active`.


## Channel modifications redraw the stay
- A Rentals United modification rewrites the booking dates AND re-draws its blocked nights: the ingest releases the booking's own stamped channel blocks first when dates shift, then re-blocks the new range, so no nights stay blocked outside the stay.
- `modify-booking` accepts `expected_updated_at`; a save from a screen older than the current row returns `STALE_BOOKING` (409) instead of undoing the channel change.
- Dashboard/Rooms realtime refresh also invalidates availability overrides, room lines and rooms so the bar and the blocks repaint together.

## Per-unit guests and notes
- Rentals United sends the booking-wide request as the `<Reservation>`-level `<Comments>` and a
  separate note inside each `<StayInfo>`. Parse them apart: read the reservation note from the
  envelope with the stay blocks stripped out, and never let a stay fall back to it — that stamped
  the same text on every unit.
- Each unit line stores its own note in `rolos_booking_rooms.guest_comments`; `bookings.special_requests`
  keeps the reservation note plus every unit note tagged by arrival date.
- A stay block with `Units` > 1 becomes that many lines, each on a distinct sibling unit of the same
  room type, with guests and rate split evenly (remainder to the first units). Two stay blocks that
  resolve to the same physical unit are also re-anchored to spare siblings, otherwise the upsert on
  `(booking_id, room_id)` collapsed them and one line's pax overwrote the other's.
