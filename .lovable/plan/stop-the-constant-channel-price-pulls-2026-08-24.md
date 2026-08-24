# Stop the constant channel price pulls

## What I found (from the logs and the queue, not guesswork)

Over the last 20 hours the channel API log shows roughly **56–150 `Pull_ListPropertyPrices_RQ` calls per hour, right through the night**. Three separate places cause it, and none of them are needed — we are the source of truth for rates:

1. **Every price push reads the prices straight back.** After a successful rate push, the property push function does a full-year price read for verification, and then immediately runs a *second* full-year price read as a "coverage audit". That is two price pulls per unit per push. The coverage rows in the database confirm it: every audit recorded in the last day carries the `post_push` trigger — nothing scheduled, all push-driven.
2. **The channel-notification repull loop pulls prices every time.** The LNM repull drain (runs every 2 minutes) reacts to each channel notification by pulling *both* availability and prices for the affected listing. Overnight it processed 267 notifications / 53 repulls — these notifications are mostly the echo of our own ARI writes, so the price read tells us nothing.
3. **Fan-out multiplies it.** Booking events and the 6-hourly ARI refresh each re-push ARI per unit, and every one of those pushes drags points 1 and 2 along with it.

The queue rows also show the reads being replayed through the shared call queue (`queued_replay: true`), which is why they keep appearing long after the original push.

## The fix

**Price read-backs become opt-in.**

- The post-push price verification and the post-push coverage audit only run when the caller explicitly asks for verification: onboarding Step B read-back, the certification runner, and the operator "Re-check" button. Routine saves, booking-triggered refreshes, cron ARI refreshes and LNM re-pushes push and stop.
- The one read-back that stays unconditional is the recovery read when a push *looks* like it failed at transport level (no HTTP status / 5xx) — that read prevents a false "push failed" and fires rarely.
- Availability read-backs stay as they are: they guard against double-booking, and they are not the volume problem.

**The notification repull loop stops pulling prices.**

- The ARI repull keeps the availability read (that is how a channel-side booking gets noticed) and drops the price read entirely.

**Coverage audits stay operator-driven.**

- The coverage audit continues to be available from the coverage panel and from the scoped runner (wizard "Re-check"), where an operator is asking the question deliberately. Nothing schedules it.

Expected effect: routine price pulls drop to near zero, with pulls only during onboarding verification, certification, and explicit re-checks.

## Technical detail

- `supabase/functions/push-property-to-ru/index.ts`: add a request-scoped `verify_readback` flag (defaulting to false, set true for onboarding/cert/re-check triggers). Guard the `verifyPrices` call at the post-push branch and the `auditChannelPriceCoverage` + `persistPriceCoverage` block behind it. Leave the transport-recovery `verifyPrices` call untouched. When skipped, `prices_year_verified` stays `undefined` and the sync log records "verification skipped (source of truth)" rather than a false pass.
- `supabase/functions/ru-onboard-property/index.ts` (Step B) and the certification runner pass `verify_readback: true` so onboarding still proves the channel holds our rates.
- `supabase/functions/cron-ru-lnm-repull/index.ts`: drop `get_prices` from the ARI branch, keeping `get_availability`; the recorded method list reflects the single call.
- Redeploy both functions plus `ru-onboard-property`.
- Verification after the change: re-query `ru_api_log` for `Pull_ListPropertyPrices_RQ` per hour and confirm the overnight baseline collapses, and check `channel_price_coverage_status` no longer gains `post_push` rows from ordinary saves.
