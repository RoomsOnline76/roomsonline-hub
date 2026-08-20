# Close the outbound booking read-back gap

Short answer: no. Inbound (channel → ROL'OS) is fully exercised, and the local money/lifecycle matrix was run on RU Test Clone A yesterday. What has never been tested is the **read-back after we push a booking change** — we send modify / cancel / reject / confirm and trust the channel's `Status ID="0"`, but we never pull the reservation back to prove the channel actually holds the new stay, unit, pax or price.

## What is already verified

- Inbound: reservation request, confirmation and cancellation notifications, 30-min poll, lead lifecycle, idempotency and replay tests, creator mapping.
- Outbound transport: modify stay, cancel, reject request, confirmed-reservation push all have successful exchanges with stored request/response XML.
- Local money: 10-scenario lifecycle matrix (extend, shorten, refund, credit on account, deposit, pax, no-show, cancel) passed after one defect fix.

## What is untested

1. No read-back of a reservation after we push a change. A `Push_ModifyStay_RQ` success is accepted as truth; nobody pulls the reservation to compare dates, unit, guest count and price.
2. Field-level coverage of the outbound path: pax-only, price-only, deposit-only, notes-only and unit-move-only changes against a **confirmed channel reservation** (the matrix used direct bookings for most of these).
3. The move scenario ended as PARTIAL — the sync held the request open past the timeout while waiting out the rate limit. Never re-run to completion.
4. Accept/confirm of a held request followed by a read-back proving the request became a confirmed reservation at the channel.
5. Cancellation read-back: after cancel/reject, the reservation status at the channel and the released nights on the availability calendar are never re-read.

## Plan

1. **Add a read-back step to the outbound sync.** After any accepted booking push, pull the reservation from the channel and compare the fields we sent (dates, listing, guests, price, status). Record the comparison on the booking's sync status so a mismatch is visible instead of silent.
2. **Move the sync off the request path.** Queue the channel work and return immediately, so a rate-limit wait can never time the caller out (this is what made scenario 6 partial).
3. **New certification action `booking_readback_test`.** For a synthetic confirmed reservation far in the future: push each change kind in turn (dates, unit, pax, price, notes), read the reservation back after each, then cancel and read back both the reservation status and the freed nights. Paced against the one-call-per-minute limit; deferrals retried, never counted as failures.
4. **Run it against RU Test Clone A** and write results to a new verification doc alongside the lifecycle simulation, updating the certification scorecard's reservation-processing rows to cite read-back evidence rather than transport-only evidence.

## Technical notes

- Read-back uses the existing `Pull_GetReservationByID_RQ` path already wired in `rentalsunited-api`; comparison logic lives in `_shared/channelBookingSync.ts` next to the push.
- All calls stay on the owning sub-user's keys via `_shared/ruBookingSync.ts`; the rate gate and `ru_call_queue` handle pacing.
- The new action sits in `ru-cert-portal` beside `reservation_idempotency_test` / `rlnm_replay_test` and deletes its own synthetic booking, per the existing certification rule.
- No schema change beyond recording the read-back verdict on `booking_sync_status`.
