# Fix "can't check in or check out" on Albatros reservation sends

## What the logs actually show (verified)

Booking: Jenny Deep, 2026-09-01 → 2026-09-04, listing 5966579, confirmed locally at 11:42, no channel reservation id.

- Every attempt is `Push_PutConfirmedReservationMulti_RQ` refused with Status 1 "Property is not available for a given dates - Can't check in or check out on selected date": 11:42:19, 11:44, 11:45, 11:47, 11:50, 11:56 — plus the same storm last night from 22:35 to 22:44. That is 12+ identical creates, so there is no circuit breaker.
- The reopen write is correct: `Push_PutAvbUnits_RQ` (386 B) sends `2026-09-01..09-03 U=1 MS=1 MX=30 C=1` plus `09-04..09-04 U=1 C=1`, Status 0 — and the create fires 0.4 s later and is still refused. Reopen Status 0 is not proof the stay is bookable.
- Changeover is not the cause. The channel calendar read at 12:20 shows `Changeover 1` (arrival and departure allowed) and `MinStay 1` on every day of the stay, and 09-04 is `Units 1, IsBlocked false`.
- The cause is units. The same calendar read shows 2026-09-01, 09-02, 09-03 as `Units="0" IsBlocked=true, Reservations="0"` — our own sold-out publish, with no reservation behind it.
- The closer is a second, unrelated availability writer: at 12:01:29 a full-window `Push_PutAvbUnits_RQ` (980 B, parent `rentalsunited-api:push_availability`, whole 12-month window) republished `09-01..09-03 U=0` right after the failed create. The booking-level `reservation_pending_at_channel` guard in `channelBookingSync` does not apply to that path, so it recomputes availability from local bookings and shuts the stay again.
- Dates are safe: `bookings.check_in_date`/`check_out_date` are `date`, not `timestamptz`, so there is no UTC slice bug.

Net: the nights are closed before the reservation exists, one writer reopens them, another closes them, and the create is retried into a wall.

## Implementation (adapter only — no calendar or booking UI changes)

### 1. A stay owed to the channel is never published as sold

- Add a short-lived "reservation write owed" claim per listing + night span, written when a create/modify is dispatched or queued and cleared only when the channel returns a ReservationID (or the write is abandoned).
- Every availability writer must consult it: booking deltas, property save deltas, rate/restriction deltas, the full-window `push_availability` path, the queue drainer and the cron refreshes. Nights under an open claim are excluded from the write (send the surrounding spans, skip the claimed nights) and the skip is recorded with `ari_reason: reservation_pending_at_channel`.
- Sold-out publication for a stay only happens after the reservation is registered; the channel closes the nights itself, and the next delta restates the truth.

### 2. Prove the nights are open before the reservation write

- After a reopen, do not fire the create in the same second. Confirm the days with the allowed availability read-back (declared purpose `reservation_write_precheck`, which is a reservation-write precondition, not recurring polling) or wait out the channel's apply latency, then send once.
- The precheck asserts, for every stay night, `Units >= 1` and, on arrival and departure days, that changeover permits check-in / check-out. If the precheck still shows the days closed, do not send: park the write and raise it to the operator.

### 3. Circuit-break the create storm

- Mirror the existing confirm-path breaker: three blocked-date refusals per listing per hour stops further create attempts for that stay; further clicks report the open breaker instead of burning the one-call-per-minute slot.
- Deduplicate identical queued creates for the same booking so the drainer cannot replay the same payload every two minutes.

### 4. Tell the operator

- Surface Status 1 / blocked-dates outcomes as a visible warning toast plus a `channel_booking_events` row with the refusal text, the nights involved and the calendar state observed, instead of a silent queue.

### 5. Repair this stay

- Clear the stale queued creates and in-flight claims for booking `1fcfb436-…` (Jenny Deep).
- Reopen 09-01..09-04 on 5966579, verify the read-back shows the nights open, send exactly one create, store the returned ReservationID, and only then let the availability delta close the nights.
- Confirm the calendar then shows the stay nights with a reservation behind them.

## Technical notes

- Touch points: `_shared/ruBookingSync.ts` (reopen → precheck → send, breaker), `_shared/channelBookingSync.ts` (claim write/clear), `_shared/ruPendingDeltas.ts` and the availability-building path used by `push_availability` (honour the claim), `cron-ru-call-queue-drain` (dedupe, breaker, no blind reopen-then-replay), `rentalsunited-api` (allow the new read-back purpose).
- The claim can live on the existing `ru_reservation_op_claims` surface if its shape can express listing + night span; otherwise a small table is added.
- No adapter wire-format change; locked availability/inventory authority rules stay as they are.
