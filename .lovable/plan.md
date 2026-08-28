# Fix RU booking identity, queue conflicts, and recurring ARI reads

## Confirmed diagnosis

- Rocko’s local booking has no `external_reservation_id`, and the authoritative child-account reservation pull contains no Rocko stay for the affected period. Every logged `Push_PutConfirmedReservationMulti_RQ` was refused, so there is currently no RU ReservationID that can safely be used in `Push_ModifyStay_RQ`.
- Deferred creates lose their local booking identity: the ordinary rate-limit queue payload omits `booking_id` and `reservation_fingerprint`. A successful replay therefore cannot persist RU’s returned ReservationID or settle the operation claim.
- Edits made while a create is pending generate a different create fingerprint, allowing multiple stale create payloads for the same booking. The queue then reopens availability and retries each payload independently.
- Once an RU ReservationID exists, the existing edit path already uses `modify_stay`; the defect is preserving and resolving identity before verb selection.
- Channel availability/price reads are still reachable from certification scoring, optional post-push verification, LNM repulls, and coverage audits. Certification currently treats its stored result as a six-hour cache rather than a permanent one-time latch.

## Implementation

### 1. Make one local booking equal one RU create operation

- Add `booking_id` and `reservation_fingerprint` as internal queue metadata on every `push_confirmed_reservation` invocation. Do not alter the RU XML or add a fictitious `ReservationID` to `Push_PutConfirmedReservationMulti_RQ`.
- Before attempting a create, look for an existing pending/claimed create for the same booking. If found, update that single queued operation to the booking’s latest dates, guests, price, and fingerprint instead of inserting another create.
- Keep the reservation operation claim linked to the latest queued payload so a replay can settle it correctly.

### 2. Make create and modify mutually exclusive

- Treat a booking with a pending RU create as “registration pending,” not as a new booking on every edit.
- After the one create succeeds, atomically persist the returned RU ReservationID onto the booking before any subsequent edit is dispatched.
- Route all later extensions, shortenings, moves, guest changes, and price changes through `modify_stay` → `Push_ModifyStay_RQ` with that real ReservationID.
- If a booking is believed to exist at RU but its ID is missing, resolve it from authoritative reservation data or successful queue/log evidence. If no unique match exists, park the edit for review; never guess an ID and never send another create merely because the ID is absent.

### 3. Remove ARI/reservation ordering conflicts

- Do not push `PutAvbUnits` as a normal precursor to booking creation or modification.
- Keep corrective reopening only for an actual RU Status 1 refusal, scoped to the affected listing and stay dates, then retry the same reservation operation once.
- Serialize booking writes per local booking/listing so a queued create, modify, cancellation, or focused ARI repair cannot overtake another operation for the same stay.

### 4. Repair Rocko’s stuck booking safely

- Retire the duplicate stale create queue rows and stale in-flight claims for this local booking.
- Because no Rocko stay currently exists at RU, enqueue one authoritative create using the booking’s latest local state; do not send `modify_stay` until RU returns a real ReservationID.
- Persist that ID on success, then verify that the local and RU dates, amount, guests, and listing agree.

### 5. Permanently stop recurring availability and price pulls

- Replace the six-hour certification snapshot with a permanent per-listing onboarding-verification latch. Each listing may perform one availability read and one price read during onboarding verification; passed results are reused indefinitely.
- Enforce the rule centrally in the RU API gateway so saves, booking events, LNM repulls, readiness rechecks, coverage audits, cron jobs, and manual refreshes cannot call `get_availability` or `get_prices` after the latch is set.
- Remove those reads from LNM and recurring coverage paths; ROLOS remains the ARI source of truth. Keep only an explicit onboarding verification context, not a general `force_probe` bypass.
- Ensure property and ARI pushes default every read-back flag to false.

### 6. Verification and cleanup

- Test: first registration while rate-limited, multiple edits during pending creation, successful ID persistence, extension via `Push_ModifyStay_RQ`, shortening, move, price-only edit, cancellation, and Status 1 retry ordering.
- Confirm the traffic log contains exactly one create for the latest Rocko state, followed only by modify calls after the returned ReservationID is stored.
- Confirm no `Pull_ListPropertyAvailabilityCalendar_RQ` or price pull occurs after onboarding verification.
- Register the 14 implemented-but-missing RU endpoint names so the endpoint coverage test and preview build pass; this is monitoring metadata only and does not enable new calls.

## Technical boundaries

- Keep reservation XML construction isolated to `rentalsunited-api` / `ruBookingSync`; Calendar UI must not construct or dispatch a second create.
- Do not modify locked adapter wire formats. Internal queue metadata is stripped from the RU XML.
- No database schema change is required; the existing JSON queue payload, operation claims, booking external ID, and onboarding ledger can hold the required state.
