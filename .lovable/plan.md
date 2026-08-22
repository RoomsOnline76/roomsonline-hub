# Fix the health report's channel failures

The report is flagging three real defects, not channel outages. Verified against the live queue rows.

## What is actually wrong

**1. Every queued acceptance retry is broken.**
Rows for `confirm_request` all end with `Action "undefined" is not supported` after burning 5 attempts. The retry stores only the reservation parameters, so the drainer replays them without telling the channel API which verb to call. No queued acceptance has ever succeeded.

**2. Retries continue for stays that are already finished.**
Reservation `147032248` is `checked_in` and `147041016` is `cancelled` in ROL'OS, yet acceptances are still being retried for them every cron pass. The channel correctly refuses ("not available for a given dates"), and the refusal is then reported as a failure in the report.

**3. Confirmed-stay pushes fail on missing guest email and stale listings.**
The reservation XML sends an empty `<Email>` when the booking has none, which the channel rejects with "Guest email is required". Separately, pushes for listings the channel no longer has ("no listing 5655616/5655617") retry to exhaustion instead of parking as a known non-action.

## What will change

- Queued acceptances will carry their verb, so the retry after the one-call-per-minute limit actually lands and the drawer stops showing "Not yet confirmed".
- Before retrying an acceptance, the drainer checks the booking's state: checked-in, checked-out, departed or cancelled stays are closed off as "nothing to do" instead of retrying and failing.
- Reservation pushes fall back to the property's own reservations email when a guest email is missing, so the channel accepts the stay.
- "No listing for this unit" and "property does not exist" outcomes are recorded as needs-republish non-actions rather than repeated failures, so the report shows work that needs doing instead of noise.
- Retired test accounts (the six dead owner IDs) stay excluded from all of this.

## Technical detail

`supabase/functions/_shared/ruBookingSync.ts`
- Add `action: 'confirm_request'` to the `enqueueRuCall` payload at the reopen-and-park branch (~line 602).

`supabase/functions/cron-ru-call-queue-drain/index.ts`
- Build the replay body as `{ action: row.action, ...payload, deferrable: false, queued_replay: true }` so any legacy queued row missing `action` still replays correctly.
- For `action === 'confirm_request'`, look up the booking by `external_reservation_id` before invoking; if `status` is `cancelled`/`checked_in`/`checked_out`/`completed`, mark the row `no_op` with a clear reason and skip the call.
- Extend `isNoOp()` to match `no listing (\d+) for this unit`, `republish the unit`, and `property does not exist`, so those park as `no_op`.

`supabase/functions/rentalsunited-api/index.ts`
- In `Push_PutConfirmedReservationMulti_RQ` (~line 896) fall back to the property's arrival/reservations email, then a constant no-reply address, when `guest.email` is empty. Same fallback for the modify path if it builds `CustomerInfo`.

Deploy: `cron-ru-call-queue-drain`, `rentalsunited-api`, plus any function importing `ruBookingSync`.

Verification: clear the exhausted `failed` rows for the two terminal reservations, then confirm a fresh drain pass logs `ok`/`no_op` and the next health report shows no `confirm_request` failures.
