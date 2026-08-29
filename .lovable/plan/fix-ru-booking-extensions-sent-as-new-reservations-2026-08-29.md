# Fix RU booking extensions sent as new reservations

## Confirmed diagnosis

- The failed extension was sent through `push_confirmed_reservation` as `Push_PutConfirmedReservationMulti_RQ`. That builder has no ReservationID, so the channel necessarily evaluates the 29–31 August stay as a second booking rather than an extension.
- The local booking currently has no `external_reservation_id`; verb selection therefore falls through the `isRuBooking()` gate and treats later edits as creates. The existing `modifyRuStay` path already builds `Push_ModifyStay_RQ`, but it cannot run until the real channel ReservationID and channel-held current stay are resolved.
- Deferred creates lose their local booking identity: the ordinary rate-limit queue payload omits `booking_id` and `reservation_fingerprint`. A successful replay therefore cannot persist RU’s returned ReservationID or settle the operation claim.
- Edits made while a create is pending generate a different create fingerprint, allowing multiple stale create payloads for the same booking. The queue then reopens availability and retries each payload independently.
- The queue drainer currently reopens dates with `PutAvbUnits` immediately before replaying `Push_PutConfirmedReservationMulti_RQ`. That does not turn the create into a modification and can conflict with the stay already held by the same reservation.
- Channel availability/price reads are still reachable from certification scoring, optional post-push verification, LNM repulls, and coverage audits. Certification currently treats its stored result as a six-hour cache rather than a permanent one-time latch.

## Implementation

### 1. Resolve reservation identity before choosing the verb

- For every extension, shortening, move, guest edit, or price edit, resolve the real channel ReservationID from the booking mapping, successful operation evidence, or an authoritative child-account reservation match before dispatch.
- Resolve the channel-held current listing, `DateFrom`, and `DateTo`; do not substitute the already-edited local dates for `<Current>`.
- If no unique existing reservation can be resolved, park/refuse the edit for reconciliation. Never guess an ID and never fall back to `push_confirmed_reservation` merely because `external_reservation_id` is null.
- Persist a uniquely resolved ReservationID on the booking before dispatching the modification so every later edit follows the same identity.

### 2. Send extensions only through `modify_stay`

- Build `Push_ModifyStay_RQ` with the real ReservationID, `<Current>` containing the dates/listing the channel already holds, and `<Modify>` containing the requested dates/listing plus price or guest changes when applicable.
- For Rocko’s extension, preserve the original arrival and channel-held departure in `<Current>`, and set `<Modify><DateTo>2026-08-31</DateTo>`; do not emit `Push_PutConfirmedReservationMulti_RQ`.
- Reserve `Push_PutConfirmedReservationMulti_RQ` exclusively for the first registration of a genuinely new local booking that has no existing or pending channel identity.
- Treat an unconfirmed channel lead separately. Because the currently integrated account has no proven working accept verb, refuse stay/pax modification with a clear instruction to confirm it at the channel first; never degrade to calendar-only edits or a second create.

### 3. Remove ARI/reservation ordering conflicts

- Do not push `PutAvbUnits` as a normal precursor to booking creation or modification.
- On a Status 1 response from `modify_stay`, inspect the affected departure day through the allowed diagnostic/onboarding verification evidence. If the new checkout day is not both arrival and departure allowed, push only that day with internal changeover `3` (wire `C=1`), then replay the same `modify_stay` once—not a create.
- Do not reopen all occupied nights for an extension; the existing reservation legitimately owns them.
- Serialize booking writes per local booking/listing so a queued create, modify, cancellation, or focused ARI repair cannot overtake another operation for the same stay.

### 4. Repair Rocko’s stuck booking safely

- Retire the duplicate stale create queue rows and stale in-flight claims for this local booking.
- Resolve Rocko’s actual ReservationID and the original channel-held `DateTo` from authoritative child-account reservation data or successful reservation evidence.
- Submit exactly one `modify_stay` using that identity and current state. If no unique existing reservation is found, stop for reconciliation rather than issuing another create.
- Persist/verify the identity and confirm the channel now holds 29–31 August on listing `5966579` with the intended amount and guest count.

### 5. Permanently stop recurring availability and price pulls

- Replace the six-hour certification snapshot with a permanent per-listing onboarding-verification latch. Each listing may perform one availability read and one price read during onboarding verification; passed results are reused indefinitely.
- Enforce the rule centrally in the RU API gateway so saves, booking events, LNM repulls, readiness rechecks, coverage audits, cron jobs, and manual refreshes cannot call `get_availability` or `get_prices` after the latch is set.
- Remove those reads from LNM and recurring coverage paths; ROLOS remains the ARI source of truth. Keep only an explicit onboarding verification context, not a general `force_probe` bypass.
- Ensure property and ARI pushes default every read-back flag to false.

### 6. Verification and cleanup

- Test: existing booking with a missing local ID, extension, shortening, move, price-only edit, lead refusal, rapid consecutive edits, and Status 1 changeover repair.
- Assert that no edit path emits `Push_PutConfirmedReservationMulti_RQ`; confirm Rocko’s traffic contains one `Push_ModifyStay_RQ` with ReservationID, authoritative `<Current>`, and the requested `<Modify>`.
- Confirm no `Pull_ListPropertyAvailabilityCalendar_RQ` or price pull occurs after onboarding verification.
- Register the 14 implemented-but-missing RU endpoint names so the endpoint coverage test and preview build pass; this is monitoring metadata only and does not enable new calls.

## Technical boundaries

- Keep reservation XML construction isolated to `rentalsunited-api` / `ruBookingSync`; Calendar UI must not construct or dispatch a second create.
- Do not modify locked adapter wire formats. Internal queue metadata is stripped from the RU XML.
- Targeted implementation scope: `ruBookingSync` identity/verb selection, `modify-booking` dispatch guard, queue stale-create suppression and ordering, and narrowly scoped repair of Rocko’s queue/claim/booking state.
- No database schema change is expected; use the existing JSON queue payload, operation claims, booking external ID, and onboarding ledger unless implementation proves they cannot represent the state safely.
