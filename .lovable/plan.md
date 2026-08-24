# Channel Monitor — Onboard: Step A collapse, rate-limit patience, currency fix

## What changes for the operator

1. **Step A collapses once it passes.** When the ledger says Step A is `passed`, the card shows a single green summary line ("Distribution account confirmed") with a "Show detail" toggle and the Re-run button. Tasks and the account preview strip stay hidden until opened. Step B keeps its detail visible while it is not passed.

2. **A queued read-back is "waiting", never "failed".** When the channel defers a read (its one-identical-read-per-minute window), the task shows an amber waiting icon with a live countdown — "Confirming with the channel — retrying in 0:47" — and the step stays in a paused/waiting state. When the countdown ends the step's remaining tasks resume automatically from the deferred task onward. Only when the channel answers with a real rejection does the step turn red with the channel's message. A rate limit alone never produces a failure toast or a red step.

3. **The currency check works again.** "Verify location & currency" currently errors with `Unknown action: verify_ru_currency (UNKNOWN_ACTION)` because it is sent to the wrong backend surface. It will be sent where that action actually lives, and a deferred currency read is treated as waiting (with countdown) rather than an error.

## Technical notes

- `src/lib/channelOnboardOrchestrator.ts`
  - `TaskResult` gains optional `retryAfterMs`; `StepRunResult` gains `retryAfterMs` and `resumeFromTaskId`.
  - `portal()` returns `retryAfterMs` from the payload (`retry_after_ms`, else 60s default) when `pending === true`.
  - `verify_currency` runner: invoke `push-property-to-ru` with `{ action: "verify_ru_currency", property_ids: [propertyId] }` (same contract `RuCurrencyVerifyCard` uses), read the matching row from `results`, map `rate_deferred` → `pending` + `retryAfterMs`, `matches === false` → failed, otherwise passed.
  - `verify_listings`: a `listings_verified !== true` answer that came back with `pending`/deferred stays `pending`; a definitive short count stays `failed`.
  - `runOnboardStep` accepts `{ startAtTaskId }` so a resume continues the chain instead of replaying passed tasks, breaks the loop on the first `pending`, and carries the smallest `retryAfterMs` into the result. Ledger verdict remains `pending` (not `blocked`) in that case.

- `src/components/admin/channel-monitor/ChannelOnboardTab.tsx`
  - `TaskState` carries `retryAfterMs`/`deferredUntil`; `TaskIcon` renders a clock plus `mm:ss` countdown for `pending`.
  - New per-step `waiting` state: `{ until: number; resumeFromTaskId }`. A 1s ticker drives the countdown; on expiry it re-invokes `runStep(step, { startAtTaskId })` silently (no error toast), up to a bounded number of automatic resumes, then leaves a "Retry now" button.
  - `runStep`: `result.pending` shows the existing informational "Step paused" toast wording adjusted to name the wait, and never the error toast.
  - Step A body wrapped in a `Collapsible` keyed off `gate.stepAStatus === "passed"`, defaulting closed, with the open state remembered per property in component state.

No database, edge function or push-payload changes are needed.
