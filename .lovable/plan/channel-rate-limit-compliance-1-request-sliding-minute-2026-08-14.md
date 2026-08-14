# Channel rate-limit compliance (1 request / sliding minute)

## What the report is telling us

The health report's `RU_ERROR ×3 — This request was rate limited…` comes from real
rejections logged in the channel API log. Over the last 3 days every rate-limited call
was the **same method**: `Pull_ListReservations_RQ` (6 rejections, latest 13 Aug).

The reservation cron already spaces its own calls a minute apart, but it is not the only
caller of that method: the parked-notification retry sweep, the live notification handler,
the lead lifecycle poll and manual/console actions all fire the same method with the same
parameters, so two independent invocations can land inside the channel's sliding minute
and one of them is rejected. There is no shared throttle across callers today — spacing
lives inside individual cron loops only.

## The fix

1. **One shared gate at the single outbound choke point.** Every channel call already funnels
   through one helper in the channel API function. Add a sliding-window reservation there,
   keyed by method + account + a fingerprint of the request parameters (dates, statuses,
   listing id), so any two callers of the same method/params are serialised regardless of
   which function or user started them.

2. **Wait instead of fail, when there is time.** If the slot is taken and the remaining wait
   fits inside the invocation budget, the call sleeps for the remainder and then proceeds.
   Only when the wait would exceed the budget does it return a distinct, non-alarming
   `RU_RATE_DEFERRED` outcome so the caller can retry on the next cadence.

3. **Exponential backoff on an actual rejection.** The channel's own rate-limit answer
   (status `-6`) is currently treated as a business error and never retried. Classify it as
   retryable in the retry wrapper with backoff steps of roughly 20s / 45s / 70s, capped so a
   single call can't exceed the function budget.

4. **Stop double-polling the same window.** The retry sweep and the lead poll reuse the
   reservation-listing method; they will consult the same gate and skip when the cron has
   already covered that account/window inside the minute.

5. **Report it honestly.** A deferral or a successfully-backed-off call is not an integration
   error — the health report will count it under a "rate-limit deferrals" line rather than the
   top channel errors list, so only genuine failures raise the alarm.

## Technical detail

- New table `ru_method_rate_limits (method_key text primary key, last_called_at timestamptz)`
  with the standard grants (`service_role` only — no client access), updated with an atomic
  conditional upsert so two concurrent edge instances cannot both claim the same slot.
- `method_key = <action>|<ru_owner_id or 'master'>|sha256(normalised params)`.
- Gate implemented in `supabase/functions/_shared/ruRateGate.ts` and called from
  `callRentalsUnited` in `supabase/functions/rentalsunited-api/index.ts`; the existing log
  write is unchanged, and a deferral is logged with `success=false, error_code=RU_RATE_DEFERRED`.
- `supabase/functions/_shared/ruInvokeRetry.ts`: treat `ru_status_id === '-6'` /
  `RU_RATE_DEFERRED` as transient with the longer backoff ladder, while keeping all other
  business errors non-retryable.
- `supabase/functions/cron-pull-ru-reservations/index.ts` and the notification retry sweep:
  consult the gate before invoking, count skips into the run summary.
- `supabase/functions/daily-health-report/index.ts`: exclude rate-limit codes from
  `top_errors`, add a `rate_limit_deferrals` count to the channel section.
