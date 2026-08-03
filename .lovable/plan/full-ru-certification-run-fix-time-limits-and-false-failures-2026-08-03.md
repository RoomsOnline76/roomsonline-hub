# Full RU Certification Run — fix time limits and false failures

## What the last full run on Tidal Pools actually shows

Run `b905bd42` (Aug 3, 22:03 → 22:06, 160s, 14 passed / 2 failed):

```text
Read-only phase        ~95s   all passed (List reservations alone: 61.6s — RU rate-limited, retried)
Push content           36.2s  passed
Push availability+prices 26.8s passed
Verify content read-back  0ms  SKIPPED
Verify availability      0ms  FAILED   (no error text)
Verify prices            0ms  FAILED   (no error text)
Push/verify long-stay, last-minute, distribution — all SKIPPED
```

Two distinct problems, both about time, not about Rentals United rejecting anything:

1. **One edge invocation cannot hold all three phases.** The suite has a 100s internal
   deadline and a 90s wait budget (the runtime kills the request at 150s). Read-only plus
   the two pushes consume ~160s on their own, so everything after the pushes is starved.
2. **The verify steps were mislabelled as failures.** When the deadline is reached the
   pacer returns "reached its time budget", but the read-back step only recognises the
   words "rate limit" or "wait budget" as a soft skip — so a budget skip is graded as a
   hard failure with an empty error. The run reports red for work it never attempted.

A third, self-inflicted cost: the verify read-backs call `Pull_GetAvailability` /
`Pull_GetPrices` with the *same* property + date range the read-only phase already used,
so RU's one-call-per-sliding-minute window forces a 60s wait per unit — four units means
the budget is gone before the first verification lands.

## What to change

### 1. Full run becomes a staged run (three invocations, one run record)
- `ru-cert-portal.run_suite` accepts `phase` (`read_only` | `mandatory` | `discounts`) and
  an optional `run_id`. With a `run_id` it appends its steps to that existing run,
  recomputes `passed`/`failed`/`total`, and only stamps `finished_at`/final status on the
  last phase. Each phase gets its own fresh 150s request lifetime and its own wait budget.
- The console's "Full certification" run drives the three phases sequentially, showing
  "Phase 2 of 3 — mandatory push…" while it works, with a short settle between phases.
- Existing single-suite runs keep working unchanged.

### 2. Stop grading time-budget skips as failures
- `ruInvoke` returns an explicit `paced: true` flag alongside `paced_skip` instead of
  relying on message text matching.
- The availability/price read-back and the step recorder use that flag: paced results are
  recorded as `skipped` with the "re-run to cover this step" note, never `failed`.

### 3. Remove the avoidable 60s waits inside a run
- Verify read-backs query a deliberately different window (tomorrow → +366 days) so RU
  treats them as new calls rather than repeats of the read-only probe — they still prove
  the pushed calendar, without waiting out a sliding minute per unit.
- Within a single run, an identical read that already succeeded is reused from an
  in-memory cache and labelled as such, instead of being re-fired and paced.

### 4. Make the result honest at a glance
- Run detail shows a phase label per step and, when a phase ended early, a single banner:
  "Phase 3 not attempted — re-run to complete", so a staged run is never mistaken for a
  content or credential failure.

## Verification
Trigger a full certification run on Tidal Pools (owner 741765, 4 units) and confirm:
all three phases complete, verify read-backs return open days and price points for
5655615–5655618, discounts push and verify, and no step carries an empty-error failure.

## Technical notes
- Files: `supabase/functions/ru-cert-portal/index.ts` (phase/run_id handling, `paced`
  flag, verify window offset, read cache), `src/components/integrations/RuCertificationConsole.tsx`
  (staged full run + phase progress + not-attempted banner).
- No schema change: `ru_cert_runs.steps` already holds the appended step array; phase is
  recorded as a field inside each step object.
- Child-scoped authentication (sub-user AccessKey/SecretKey via `owner_id`) is untouched.
