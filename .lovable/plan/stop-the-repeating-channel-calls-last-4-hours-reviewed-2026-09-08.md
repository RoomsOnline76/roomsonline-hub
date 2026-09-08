# Stop the repeating channel calls (last 4 hours reviewed)

## What the log actually shows

193 channel calls in four hours. Two were refused with "rate limited", but the refusals are only
the symptom — most of the traffic was work that changed nothing.

Three distinct sources, all verified in the logs:

**1. A self-feeding loop on two bookings (the biggest source: ~55 calls)**

Every 30 minutes the reservation pull re-reads the same two stays from the channel and re-writes
their room lines locally. That local write trips the database trigger that means "a booking
changed — tell the channel", so 45 seconds later an outbound job runs: one reservation read plus a
queued availability and price push. The recorded outcome of every one of those pushes is
`reservation: skipped` — nothing was ever sent, because nothing had changed. It has repeated on
the half hour all day for bookings `ROL` records `ecf11bc8…` (reservation 147176102) and
`b9d8f7ce…`.

Cause: the trigger treats *any* write to a booking's room line as a move, and the 90-second
"this was our own ingest" guard does not cover it — the guard only looks at a sync stamp that the
inbound ingest does not refresh.

**2. The stale-hold check duplicating the pull it runs inside (both rate-limit refusals)**

The 30-minute pull asks each account for its reservations, then — in the same run — the stale-hold
check asks the channel about reservation 147112908, which the channel says does not exist. It then
falls back to *listing* reservations again, per account, with a 7-day/400-day window. At 19:01 that
fired two listings 1 second apart on the same method, and the channel refused the second one.

Worse, that refusal is recorded as "rate limit — will verify next run", so the booking is never
settled and the whole sequence repeats every two hours (seen at 15:01, 17:01, 19:01). The channel
had already given a definite answer three times on the id itself; the listing fallback was
unnecessary.

**3. Legitimate traffic (leave alone)**

The 18:00 burst of 101 price pushes is one real rate change fanned out over listings and chunked
Full-Stay seasons. One reservation listing and one lead listing per account per cycle is the
intended safety net. No change proposed there.

## The fix

**A. Do not bounce our own inbound ingest back out**
- Have the inbound reservation ingest stamp the channel sync marker it already owns whenever it
  writes a booking or its room lines, so the existing 90-second echo guard actually sees it, and
  widen that guard's window to cover the job's 45-second delay.
- Tighten the room-line trigger: only enqueue when a field the channel sells actually changed
  (room/unit, dates, pax, status), not on every write. A write that leaves those identical
  enqueues nothing.

**B. Make a definite "does not exist" final**
- When every account with keys answers "reservation does not exist" on the id, settle the booking
  locally there and then. Do not run the listing fallback and do not turn the outcome into
  "deferred" — a rate refusal on a *fallback* is not evidence that the reservation lives.
- Keep the listing fallback only for the case it was written for: the channel did not answer at
  all, or answered partially.

**C. Never repeat the same method inside its own minute**
- Reuse the listing the current run just fetched instead of asking again: the pull already has
  each account's reservations in memory when the stale-hold check runs, so pass them in.
- Where a second call is genuinely needed, respect the same one-per-minute spacing the pull
  already applies, rather than firing accounts back to back.

**D. Settle the two stuck records**
- Reservation 147112908 (booking still `confirmed`, checkout 2026-09-09): the channel has said
  three times it does not exist — settle it and release its nights.
- Reservation 147176102 keeps reporting "this property does not accept departures on Friday
  2026-09-18" on every retry. That is a real, permanent refusal, not a transient one: record it as
  a blocker needing an operator decision once, and stop re-attempting it every 30 minutes.

## Expected result

The half-hourly loop disappears (roughly 110 of the 193 calls in the window), the two rate-limit
refusals stop, and no genuine sync path loses a call. Every change is verified afterwards against
the live call log for the next few cycles: one listing per account per cycle, reservation detail
reads only when something new arrived, and no repeated method inside a minute.

## Technical detail

- `public.enqueue_channel_booking_sync()` — room-line branch is unconditional; add a
  field-comparison guard, and widen the `booking_sync_status` recency window past 45 s.
- `_shared/ruReservationIngest.ts` — stamp `booking_sync_status(external_system='rentalsunited')`
  on inbound writes; in `fetchRuReservationById`, return a terminal `absent` verdict when all keyed
  scopes answer status 28 and skip `attemptListLookup`.
- `_shared/ruStaleHoldSweep.ts` — accept the run's already-fetched listings; treat terminal absence
  as `cancelled` (settle locally); only `deferred` when the *id* read itself was rate refused.
- `cron-pull-ru-reservations/index.ts` — hand the fetched reservation blocks to the sweep and apply
  `METHOD_WINDOW_MS` spacing to any sweep-issued listing.
- Deploy `cron-pull-ru-reservations`, `ru-reservation-handler`, `process-background-jobs`,
  `channel-booking-sync`; migration for the trigger function.
