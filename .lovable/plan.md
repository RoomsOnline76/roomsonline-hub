# ARI failures + honest health reporting

## What the data actually shows

Rentals United ARI refresh runs every 6 hours. Recent outcomes (`ru_sync_runs`, action `refresh_ari`):

```text
10 Aug 06:00  OK
10 Aug 00:00  FAILED  RU_ARI_REFRESH_INCOMPLETE (502)
09 Aug 18:00  OK
09 Aug 12:00  FAILED  RU_ARI_REFRESH_INCOMPLETE
09 Aug 06:00  FAILED  RU_ARI_REFRESH_INCOMPLETE
09 Aug 00:00  OK
```

Drilling into the stored run details for the 00:00 failure: all four Jongensfontein units pushed availability successfully, but the **price push for two units returned "Edge Function returned a non-2xx status code"** — the channel API call itself failed mid-batch (the same transient 5xx / cold-boot class of error seen on the channel API earlier). Nothing is wrong with the rates or coverage: the same run reports `366/366 days priced`. So this is a flaky upstream call with no retry, not a data defect.

Two separate problems, then:

1. **The failure is real but transient and unretried.** Availability pushes already retry (there is a reserved-dates retry path); price pushes do not. One bad call fails the whole property run.
2. **The report contradicts itself.** The header said "All Systems Operational · failing 0/13" and TOBI said "zero failures" while the channel strip on the same page said "Now failing · Failed 6". The headline and the AI summary are computed only from `system_health_components` probes; the channel-manager numbers are never fed into either. Also, the row-level "Now" state is correct at send time — the 06:00 success landed ~20s after the report was generated — but nothing tells the reader that.

## Changes

### 1. Make ARI pushes survive transient channel errors
In `push-property-to-ru` (`pushARI`):
- Wrap the `push_prices` invocation (and the initial `push_availability` invocation) in a small retry helper: up to 3 attempts, 1.5s → 4s backoff, retrying only transient failures (HTTP 5xx / 429, boot or timeout errors). Never retry validation/business errors such as stale listing, currency block, or coverage abort.
- Read the real error body instead of storing the generic "Edge Function returned a non-2xx status code", so `error_code`/`error_message` in `ru_sync_runs` name the actual upstream status.
- Record `attempts` per target in the run details so repeat flakiness is visible.

This stays outside the locked regions (OwnerID resolution / phase gate / `inventory_push` evidence writes are untouched).

### 2. Escalate genuine repeat failures
In `cron-refresh-ru-ari`: after retries, if a property still fails, keep logging as today, but add a consecutive-failure marker so the health report can distinguish "one flaky call" from "broken for 3 cycles".

### 3. Stop the report claiming all-clear while a pipeline is failing
In `daily-health-report`:
- Fold channel state into `overallStatus`: if the latest run of any priority channel action failed, the report is at best **Degraded**, and the headline reads e.g. "Degraded — channel ARI failing" instead of "All Systems Operational".
- Include the channel figures (total calls, failed count, per-action current state, top error codes, ARI staleness) in the AI digest prompt so TOBI cannot say "zero failures" when six calls failed.
- Add a generated-at stamp and, on any action whose last failure is older than its latest success, label the row **Recovered (last fail HH:MM)** rather than leaving a stale red "Failing" that a later run already cleared.
- Keep the counter honest: `failing 0/13` becomes `failing 0/13 components · 1 pipeline failing`.

## Verification
- Re-run the health report function and confirm the header, counters and TOBI summary all agree with the channel strip.
- Trigger an ARI refresh and confirm price pushes log attempt counts and a real upstream status on failure.

## Not changing
- Rate/season data and coverage logic — the failure was not a pricing gap.
- Any region listed in `.lovable/ADAPTER_LOCKS.md`.
