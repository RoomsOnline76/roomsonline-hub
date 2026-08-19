# Channel request 147030165 never reached the dashboard

## What actually happened (verified from the logs)

The subscription is live and the notification did arrive. At 13:43:11 the channel posted an
unconfirmed reservation (a "REQUEST") for Mickey Mouse Pluto, and it is stored in our
notification table — but with no stay data, so no booking was created:

- The notification envelope contains `<StayInfos />` — empty. No dates, no listing id, no price.
- Our handler therefore pulled the reservation by id and fanned out across accounts.
  Account 742004 answered `Status 0 Success`, but that detail response also carried
  `<StayInfos />` empty, so it was rejected as unusable.
- The remaining scopes answered `Reservation does not exist.` (accounts 741761 and master),
  and both listing endpoints (`Pull_GetLeads_RQ`, `Pull_ListReservations_RQ`) returned
  empty `<Leads />` / `<Reservations />` for every account, then hit the 429 rate limiter.
- The notification was correctly parked as `retrying` with `next_attempt_at = 13:46`.
  It is now 13:52 and the retry has **not** run: the retry sweep only executes inside the
  reservation poll, which runs every 30 minutes (last run 13:30, next 14:00).

So there are three separate problems: the request is invisible in the UI while it waits,
the retry cadence is far coarser than the backoff it writes, and the lead listing calls
come back empty even though the channel clearly holds the request.

## What to change

### 1. Make the request visible immediately (no more silent waiting)
Create the stay as soon as the notification lands, even without dates:
- Insert/refresh a `pending` channel request booking from what the envelope does give us
  (reservation id, guest name, email, phone, creator account, created date), flagged as
  awaiting channel detail.
- When the detail pull later succeeds, the existing idempotent ingest fills in dates, unit,
  and amounts on the same record instead of creating a second one.
- Surface the awaiting-detail state in the Reservations / Command Centre list with a
  "channel detail pending" badge and the existing manual retry button, so an operator can
  see and action it within seconds of the channel notification.

### 2. Retry on the schedule we already promise
- Run the notification retry sweep on the short-interval drain that already ticks roughly
  every 40 seconds (the call-queue drain), instead of only inside the 30-minute poll.
- Keep the poll's sweep as a backstop. Sweep stays idempotent, so double execution is safe.

### 3. Fix the lead lookup that returns empty
- Narrow the `Pull_GetLeads_RQ` / `Pull_ListReservations_RQ` window: we currently ask for
  2026-05-21 → 2027-08-19 (15 months). Request a recent, bounded window (e.g. last 7 days of
  creation/modification) for the notification-driven lookup, and page wider windows only for
  the scheduled reconciliation.
- Try the owning account first. The envelope's `Creator` (`ru-owner@roomsonline.co.za`) and
  the account that answered the by-id pull both point at 742004; use that as the first scope
  instead of discovering it last.
- Respect the rate limiter: when a scope answers 429 / rate-deferred, treat it as "unknown",
  not "not found", and re-queue that scope rather than burning the attempt.

### 4. Verification for this exact request
- Re-run the retry for reservation 147030165 and confirm it lands as a pending request with
  19–26 Aug 2026, 2 adults, 4,270.00 ZAR, on the correct unit.
- Confirm the notification row flips to `resolved` and that no duplicate booking appears
  after the next scheduled poll.

## Technical notes

- `supabase/functions/ru-reservation-handler/index.ts` — insert the provisional pending
  request before the detail pull; keep the existing `scheduleRuNotificationRetry` path.
- `supabase/functions/_shared/ruReservationIngest.ts` — allow a dates-less "awaiting detail"
  ingest, order the fan-out by resolved/creator owner, bound the list windows, and stop
  treating rate-deferred responses as authoritative misses.
- `supabase/functions/_shared/ruNotificationRetry.ts` — unchanged backoff; called from the
  frequent drain (`cron-ru-call-queue-drain`) as well as `cron-pull-ru-reservations`.
- Adapter-locked regions are not touched; availability/inventory logic is untouched.
