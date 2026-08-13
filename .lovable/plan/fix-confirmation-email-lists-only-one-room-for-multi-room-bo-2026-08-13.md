# Fix: confirmation email lists only one room for multi-room bookings

## What is wrong

ROL-TID-0243 (Fab Fam, 13–18 Aug 2026) is a three-unit stay. The database does hold all three lines — Elf, Geelstert and Leervis, 2 adults and R2 500 each — in the booking's room-lines table. The email shows only "Elf · 6 adults", because the email builder never reads that table.

Verified in the data:
- The booking record's own `rooms` array and physical-room id list are both empty.
- Its single `room_type_id` points at Elf only.
- The three real lines live in `rolos_booking_rooms`.

So the email function's room hydration falls through to its last resort — "use the booking's single room type" — and prints one unit, then attaches the whole party (6 adults) to it.

## The fix

In `supabase/functions/send-booking-email/index.ts`, insert `rolos_booking_rooms` as the primary source when the booking has no inline rooms:

1. Query `rolos_booking_rooms` for the booking (joined to `rolos_room_types` for the type name, and to `rolos_rooms` for the unit label/number when `room_id` is set), ordered by creation.
2. Map each line to the shape the template renderer already expects: room/unit name, per-line adults, teens, children, infants, stay dates, and the line's rate.
3. Keep the existing physical-room and single-room-type paths as fallbacks, in that order, so single-room and channel bookings are unaffected.
4. Per-line occupancy comes from the line itself, not from the booking totals, so each unit reads "2 adults" instead of every unit reading "6 adults".
5. `{{room_names}}` then becomes "Elf, Geelstert, Leervis"; `{{rooms_booked}}` renders one bullet per unit.

Optionally show each line's amount (R2 500) beside the unit so the R7 500 total reconciles visually in the email.

## Verification

- Re-send the confirmation for ROL-TID-0243 and confirm three units appear with 2 adults each and dates 13–18 Aug.
- Re-send a single-room booking's confirmation and confirm nothing changed.
- Check the function logs for the hydration line reporting 3 rooms.

## Technical notes

- Only the edge function changes; no schema change and no migration.
- Reservation/invoice/settlement emails share `replaceTemplateVariables` in the same function, so they inherit the fix once `booking.rooms` is hydrated correctly.
- Rate per line is `rate_charged`; nightly is `nightly_rate`.
