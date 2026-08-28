# Focused unit-level channel pushes on booking events

Today a booking change (modify, cancel, guest cancel, confirm, check-in) fires more channel traffic than it should. Confirmed in the code:

- `cancel-booking`, `guest-cancel-booking`, `push-booking` and `modify-booking` each queue a `channel_ari_delta` job carrying only `property_id` + `force: true`. With no unit and no date span, the channel refresh walks **every listed unit for the full default window** — prices and availability for the whole property.
- The database trigger `enqueue_channel_booking_sync` queues a **second** job (`channel_booking_sync`) for the same edit. That path is already scoped to the booked unit and the stay span, so the same event produces one focused push plus one whole-property push.
- The trigger fires for changes that cannot move channel inventory at all — notes, payment, deposit, plain status moves, and the check-in/check-out transition — and each of those still runs an availability + price delta with a calendar read-back.
- The scoped path derives the unit from `bookings.room_type_id` only, so a multi-room stay pushes one unit and misses the others.

## What changes

1. **One push per booking event, always unit-scoped.** The four booking functions stop queuing the blunt `channel_ari_delta` job and instead queue the focused `channel_booking_sync` job (the same one the trigger uses), carrying the change kind, the previous room/dates and the affected unit ids. Dedupe keys become per booking + change so a burst collapses instead of stacking.
2. **Only the booked unit(s) and only the touched nights.** The scoped push resolves every unit the stay occupies (booking row plus its room lines, old and new), and the date window spans the old and new stay nights only.
3. **No push for changes the channel cannot see.** Notes, payment, deposit, commission and pure check-in / check-out / checked-out status moves skip the availability and price delta entirely. Cancel, no-show, date change, unit move, pax and price still push. Reservation-level cancel/modify verbs for channel-owned bookings are unaffected.
4. **Trigger and function no longer double up.** The trigger keeps its role as the safety net for direct database edits, but its dedupe key aligns with the one the functions use, so whichever lands first wins and the other is dropped.
5. **Evidence.** The traffic monitor entry for each booking-driven refresh records the unit ids and the night span it was scoped to, so an unscoped push is visible immediately.

## Technical notes

- `supabase/functions/_shared/channelBookingSync.ts`: extend unit resolution to collect `room_type_id` from the booking, its `rolos_booking_rooms` lines and `request.previous`; add a change allow-list gate before `queueRuAriDelta`.
- `cancel-booking`, `guest-cancel-booking`, `push-booking`, `modify-booking`: replace `channel_ari_delta` enqueues with `channel_booking_sync` payloads (`change`, `previous`, `only_unit_ids`), dedupe `channel_booking:<booking_id>:<change>`.
- `process-background-jobs`: pass `only_unit_ids` / date span through the `channel_booking_sync` case; keep `channel_ari_delta` supported for property-wide callers (content/cron) but require an explicit scope from booking triggers.
- Migration: update `enqueue_channel_booking_sync` to skip `notes`, `payment`, `deposit` and check-in/out status transitions, and to use the shared dedupe key.
- No change to `push-property-to-ru`; its `only_unit_ids` and `ari_date_from/to` handling already filters correctly.
