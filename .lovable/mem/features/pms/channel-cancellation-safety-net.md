---
name: Channel cancellation safety net
description: Live channel stays the channel never listed are verified one-by-one and settled locally; portal cancellations release their nights without a callback
type: feature
---

A reservation or request cancelled inside the Channel Manager portal does not always produce a
live notification, and the reconciliation pull only ingests what the channel still returns — so a
withdrawn hold used to stay `pending`/`confirmed` in ROL'OS forever, blocking its nights.

`supabase/functions/_shared/ruStaleHoldSweep.ts` (`sweepStaleRuHolds`) closes that loop:

- Candidates: `pending`/`confirmed` channel-sourced bookings (`booking_channel = 'rentals_united'`
  or `integration_type like 'rentalsunited%'`) with a channel reservation id, not yet departed, that
  the current run did NOT see in the channel's own answers (`seenReservationIds`, fed by both the
  reservation and lead passes of `cron-pull-ru-reservations`).
- One owner-scoped detail read per candidate; default 3 per run, 90-minute per-reservation cooldown
  (marker rows in `ru_notifications` with `event_type = 'stale_hold_verify'`), stays younger than
  15 minutes are skipped.
- Verdicts: channel says cancelled/rejected/expired or "does not exist" → cancel locally with reason
  "Cancelled at the Channel Manager", `cancellation_reason_category = 'channel_cancelled'`, and
  `releaseChannelBlocksForBooking`. A rate refusal (`RU_RATE_DEFERRED`) or any unclear error is NEVER
  a cancellation — it is deferred/inconclusive and retried later. Never pass `kind: 'cancelled'` into
  `refreshRuReservationById` here; the channel's own answer must decide.
- Operator escape hatch: "Check with the Channel Manager" on the booking card →
  `ru-reservation-handler` with `{ verify_stale_holds: true, reservation_id }`.
- The local-settle path in `refreshRuReservationById` also releases blocks now: a cancelled stay must
  never keep its stamped nights.
- `cron-pull-ru-reservations` skips re-ingesting a channel cancellation whose local booking is already
  cancelled (it was filing a notification row every 30 minutes).
