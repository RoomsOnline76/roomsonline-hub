# Make channel acceptance on a reservation edit fast

## What's actually happening

You're right that only one reservation is pushed. The slowness is not volume of reservation calls — it's that the operator's acceptance call is standing in the same queue (and the same one-per-minute slot) as the background price/availability read-back storm.

What the current data and code show:

- The rate gate keys a slot as `method + account + hash(parameters)`, so accepting reservation X can only be blocked by another *identical* call to the same reservation. That does happen: a failed acceptance is parked in the background queue and replayed by the drainer, and that replay claims the slot for exactly the same parameters your Save click needs. Right now there is a parked `confirm_request` row (1 attempt) whose channel error is "Property is not available for a given dates — Can't check in or check out on selected dates".
- Every queued call is enqueued at the same priority (100). The queue is currently full of `get_prices` read-backs created seconds apart, and the drainer claims strictly by `priority, created_at` — so a reservation acceptance replay waits behind dozens of price read-backs.
- `Pull_ListPropertyPrices_RQ` alone logged 209 rate-deferred attempts in the last 3 hours, plus `Pull_ListPropertyAvailabilityCalendar_RQ` and `Pull_ListOwnerProp_RQ` bursts, including traffic on retired test account 741765. Those calls burn slots and drainer time that the interactive path needs.
- Inside one Save, `modify-booking` runs acceptance and then the stay modification serially, and each can sit in the gate for up to 25 seconds before it gives up — so a single edit can hold the dialog for ~50s and still end in "rate limited".

So: single reservation, yes — but it is queued and throttled as if it were background bulk work.

## Fix

1. **Reservation writes jump the queue.** Give `confirm_request`, `reject_request`, `modify_stay`, `cancel_reservation` and the `push_availability` reopen a high priority (low number) when parked, and leave read-backs at the default. The drainer then always drains an acceptance before price read-backs.
2. **An operator click takes over its own parked duplicate.** Before the inline acceptance claims a slot, absorb any pending queue row for the same reservation (mark it superseded) so our own retry can no longer block the person clicking Save. Today the code only *reads* that row to decide whether to reopen nights.
3. **Don't spend the interactive request waiting on the gate.** For reservation writes, wait only briefly for the slot; if the slot is genuinely held, park the work at high priority and answer immediately with a clear "queued — landing within a minute, we'll confirm" state instead of a 25s stall followed by an error. Keep the existing rule that nothing is promoted locally until the channel really accepted.
4. **Report the truth in the dialog.** Three distinct outcomes instead of one generic failure: accepted and pushed, queued at the channel (with the live confirmation arriving on its own), rejected by the channel with the channel's reason. Reuse the existing toast lifecycle pattern used for rate-plan pushes.
5. **Stop the read-back storm from crowding the window.** Collapse duplicate pending `get_prices` / availability read-backs for the same property into the single waiting row (the queue key already supports this) and skip retired channel accounts on these read paths, so slots and drainer budget aren't spent on work nobody is waiting for.
6. **Address the parked blocked-dates row.** The reopen-then-accept self-heal exists but currently only runs on the inline path. Make the queued replay perform the same reopen before its retry, so a parked acceptance can heal itself instead of retrying into the same rejection until attempts are exhausted.

## Technical notes

- `supabase/functions/_shared/ruRateGate.ts`: add a priority constant for reservation write actions; add a short-wait option for interactive callers; add a helper to supersede a pending duplicate row by method key.
- `supabase/functions/_shared/ruBookingSync.ts`: `confirmRuRequest` absorbs the parked duplicate before claiming; the deferred branch returns a `queued` outcome carrying the queue id rather than a flat failure; `modifyRuStay` propagates it.
- `supabase/functions/rentalsunited-api/index.ts`: enqueue reservation writes as deferrable-with-priority instead of returning a bare 429; keep read defaults unchanged.
- `supabase/functions/cron-ru-call-queue-drain/index.ts`: reopen-own-nights step for a `confirm_request` replay whose last error is the blocked-dates message.
- `supabase/functions/modify-booking/index.ts` and `src/components/pms/BookingModifyDialog.tsx`: surface accepted / queued / rejected distinctly; the ARI delta job stays a background job as it is today.
- No schema change required; `ru_call_queue.priority` and `not_before` already exist.

## Verification

- Accept a held request while the price read-back queue is deep: the acceptance drains first, and the dialog resolves in seconds with either accepted or queued.
- Click Save twice quickly: the second click supersedes its own parked duplicate instead of being rate-deferred by it.
- Check `ru_api_log` after: no `RU_RATE_DEFERRED` rows for `Push_ConfirmRequest_RQ` caused by our own replay, and the parked blocked-dates row either heals or fails with the channel's reason surfaced.
