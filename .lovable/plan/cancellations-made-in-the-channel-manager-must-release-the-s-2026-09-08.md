# Cancellations made in the Channel Manager must release the stay in ROL'OS

## What we found

- The Mickey Mouse request (channel reservation 147176019) arrived at 07:06 today as an unconfirmed request and is still sitting in ROL'OS as **pending**, holding 9–11 Sep. Nothing has arrived from the channel since — the inbound notification log has no entry after that first request, so no cancellation callback was received for it.
- When the channel *does* send a cancellation envelope, ROL'OS handles it correctly. The earlier Peter Parker stay on the same listing was cancelled and its nights released the moment the cancellation callback landed (06 Sep, 06:13).
- The 30-minute reconciliation pull only ingests the reservations and requests the channel still returns. There is no step that looks at a stay ROL'OS believes is live and asks the channel whether it still exists. So a request withdrawn or cancelled in the channel portal — which is exactly the case where no callback is sent — stays pending in ROL'OS forever and keeps blocking the dates. The same gap applies to a confirmed reservation cancelled in the portal if its callback is ever missed.
- A second symptom in the same area: an already-cancelled channel reservation (147160148) is re-pulled and re-processed every 30 minutes even though it settled two days ago.

Note: the exact reason no callback arrived for the withdrawn request cannot be proven from our side (nothing was delivered to log). The fix therefore does not rely on the callback arriving.

## What to build

### 1. Channel-state reconciliation sweep (the actual fix)

Add a sweep to the existing 30-minute channel reservation job that closes the loop on stays ROL'OS still believes are live:

- Select channel-sourced bookings (`booking_channel = 'rentals_united'`, or `integration_type` starting `rentalsunited`) that are `pending` or `confirmed`, hold a channel reservation id, and have not yet departed.
- For any of those that were **not** seen in this run's reservation/request answers for their account, do a single owner-scoped detail read of that one reservation.
- Decide from the answer:
  - channel reports cancelled / rejected / expired, or reports the reservation no longer exists → cancel locally with reason "Cancelled at the Channel Manager", release the stamped nights, and record it on the booking trail as an inbound cancellation.
  - channel still reports it live → leave untouched (and, if the local stay differs, let the existing ingest path update it as it does today).
  - channel refuses on the rate limit → skip; the next run picks it up. Never treat a rate refusal as a cancellation.
- Cap the number of verifications per run and space them so the sweep cannot exhaust the channel's per-method minute; carry the rest to the next run, oldest first.

### 2. Stop re-processing settled cancellations

Skip ingest for a pulled reservation whose local booking is already cancelled and whose channel state is unchanged, so the every-30-minutes replay of 147160148 stops. Notifications still log, but no write and no availability work happens.

### 3. Operator escape hatch

On the booking card, a "Check with the Channel Manager" action that runs the same single-reservation verification on demand and reports the outcome (still live / cancelled and released / channel could not answer). Uses the existing retry entry point on the reservation handler.

### 4. Backfill the current case

Run the sweep once so the pending Mickey Mouse hold on 9–11 Sep is verified against the channel and released if the channel no longer holds it.

## Technical notes

- New shared helper `supabase/functions/_shared/ruStaleHoldSweep.ts`: takes the set of reservation ids seen this run per account, resolves candidates, calls `refreshRuReservationById` with `kind: 'cancelled'` semantics only when the channel confirms a dead state, and reuses `releaseChannelBlocksForBooking` for the nights.
- Reservation lookups stay owner-scoped and child-key-authenticated (`ruBookingSync` credential resolution); a master-auth answer is refused, per the existing rule.
- Wire the sweep into `cron-pull-ru-reservations` after both the reservation and lead passes, and expose it through the handler's JSON body (`{ sweep_stale_holds: true }`) so it can be run on demand.
- Dead-state detection reuses `classifyRuStatus` (2/7/8 → cancelled) plus the existing "Reservation does not exist" / status 28 handling already present in `refreshRuReservationById`.
- Tests: dead channel state cancels and releases; live channel state leaves the booking alone; rate refusal is a no-op; already-cancelled local booking is skipped; verification budget respected.
