# Fix RU booking extensions being replayed as new bookings

## Confirmed diagnosis

At 00:31–00:44, two queued payloads for the same local booking repeatedly sent `Push_PutConfirmedReservationMulti_RQ`:

- 29 Aug–1 Sep at 4,200
- 29–31 Aug at 2,800

Each retry first sent `Push_PutAvbUnits_RQ` to open the dates, then sent the create request without a `ReservationID`. RU therefore evaluated each payload as a second booking overlapping the stay already held and returned Status 1. The queue exhausted five attempts for both stale creates.

A separate `Push_ModifyStay_RQ` for RU reservation `147097867` succeeded at 00:31:06, but it concerned 7–9 Sep and was not the failing Rocko stay.

## Changes

1. **Resolve the existing RU reservation before choosing a verb**
   - For every edit, extension, shortening, room move, or drag/drop, resolve the existing RU ReservationID from the booking/channel reservation mapping and stored external ID.
   - Treat booking identity as stable even while an earlier channel write is queued.
   - Never infer “new booking” merely because `external_reservation_id` is temporarily null.

2. **Make create and modify mutually exclusive**
   - Use `Push_PutConfirmedReservationMulti_RQ` only for the first creation of a genuinely new ROLOS booking.
   - Use `Push_ModifyStay_RQ` for every subsequent stay change, with the existing RU ReservationID, RU’s current dates, and the requested new dates/price.
   - If the RU ReservationID cannot yet be resolved, park one modification behind the pending create; do not enqueue another create.
   - Coalesce later edits so only the newest requested stay survives.

3. **Stop ARI from competing with reservation writes**
   - Do not send normal booking-event ARI before create/modify.
   - For a Status 1 modify only, open the focused extension/departure dates with the existing internal changeover `3` → wire `C=1` mapping, then replay `modify_stay`, never `push_confirmed_reservation`.
   - Prevent the queue drainer from running an ARI delta for the same property/unit/date span while a reservation create or modification is pending.

4. **Repair current stuck state**
   - Retire the two failed stale create queue rows and their operation claims for this booking so they cannot replay again.
   - Resolve the correct RU ReservationID and RU-held current stay dates for Rocko’s booking.
   - Submit one `Push_ModifyStay_RQ` for the latest intended dates and amount.
   - Persist the successful external reservation identity and channel sync state.

5. **Verify regressions**
   - Test extension, shortening, drag/drop, price change, rapid consecutive edits, queued-first-create, and Status 1 retry.
   - Assert no edit path emits `Push_PutConfirmedReservationMulti_RQ` once a booking has a pending or established RU identity.
   - Confirm logs show one focused modify and no full-property ARI push or duplicate create.

## Technical scope

- `supabase/functions/_shared/ruBookingSync.ts`: stable identity resolution and create/modify exclusivity.
- `supabase/functions/_shared/channelBookingSync.ts`: pending-create detection and edit coalescing.
- `supabase/functions/modify-booking/index.ts`: route edits through the same authoritative resolver.
- `supabase/functions/cron-ru-call-queue-drain/index.ts`: stale-create suppression, latest-edit coalescing, and reservation-vs-ARI ordering.
- Database migration only if the existing queue/claim metadata cannot represent a pending RU identity safely.

The previously approved shutdown of recurring channel price/availability pulls remains unchanged and will be implemented alongside this repair.
