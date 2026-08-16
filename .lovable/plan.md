# Channel rate gate: verified in place, but it drops calls instead of queuing them

## What I verified (live data, last 24–36h)

- The shared gate is wired into the single outbound choke point: every channel call goes through
  `callRentalsUnited`, which claims a sliding-minute slot before sending.
- It is working for its stated purpose: **zero rate-limit rejections from the channel** in the last
  36 hours (no `-6` / "rate limited" responses in the call log).
- The queue drainer for live-notification read-backs is scheduled and running every 2 minutes.

So the gate is in place and effective at protecting us from the channel.

## The real problem: it defers, it does not queue

The gate waits at most ~25s for a free slot and then gives up with `RU_RATE_DEFERRED`. In the last
24 hours that happened **3 700+ times**, roughly half of all channel calls:

| Call | Total | Deferred |
|---|---|---|
| Availability read-back | 4 014 | 2 264 |
| Price read-back | 2 980 | 1 275 |
| Owner property list | 178 | 106 |

A deferral is not a queued call — the work is simply abandoned unless the individual caller happens
to retry. Evidence that it is lossy: the one live read-back job in the queue is sitting in
`skipped` after 3 attempts, all of them deferrals. So verification read-backs are silently not
happening, which is why ARI/coverage checks intermittently look stale.

## What to build: a real background work queue

1. **One durable queue for all outbound channel calls that can wait.** A single table holding the
   pending call (method, account, parameters, requesting property, priority, attempt count,
   `not_before` timestamp) with a uniqueness key equal to the gate's method key, so a duplicate
   request inside the window collapses into the existing row instead of becoming a rejection.
2. **A single drainer on a fixed cadence** that takes the oldest eligible row, claims the gate slot,
   makes the call, and records the result. Because there is exactly one drainer, calls are naturally
   spaced to the channel's one-per-sliding-minute rule and nothing is dropped.
3. **Enqueue instead of defer.** When the gate cannot grant a slot, deferrable calls (read-backs,
   list pulls, discount/ARI refreshes, notification-driven verification) are enqueued and the caller
   returns "queued" rather than "failed". Interactive/booking-critical calls keep today's behaviour:
   wait briefly, then surface the error — never queue a booking push behind a minute of reads.
4. **Backoff and a ceiling.** Growing `not_before` per attempt, a max attempt count, and a terminal
   `failed` state with the real reason so a genuinely broken call stops recycling.
5. **Drop redundant read-backs at the source.** Deduplicate the availability + price verification
   pulls per property/date window so a burst of changes produces one pull each, not one per unit.
6. **Visibility.** Show queue depth, oldest waiting item, and drained/failed counts on the Channel
   Monitor, and report queued work separately from failures in the daily health report.

## Technical notes

- Table `public.ru_call_queue` (service_role grants only), unique on the gate's `method_key` while
  a row is pending; RPC for atomic claim-one-row-for-work.
- Reuse `_shared/ruRateGate.ts` key derivation so the queue and the gate agree on identity; add an
  `enqueue` path used by `callRentalsUnited` in place of throwing `RuRateDeferredError` for calls
  flagged deferrable.
- New `cron-ru-call-queue-drain` scheduled every minute; `cron-ru-lnm-repull` becomes a producer
  into the same queue rather than its own drainer.
- `_shared/ruInvokeRetry.ts`: treat "queued" as a non-error outcome instead of a retryable failure.
- No adapter-locked files touched.
