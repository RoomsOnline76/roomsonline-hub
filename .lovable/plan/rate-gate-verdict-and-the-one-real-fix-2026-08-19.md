# Rate gate: verdict and the one real fix

## Answer

The rate gate is **used and working**. Those 100 rows are not unhealed errors — they are the gate's own bookkeeping, and the work behind them completed.

Evidence from the last 90 minutes of the exchange log:

```text
Pull_ListPropertyPrices_RQ   102 completed   |  79 rate_deferred (last 22:37)
Push_PutPrices_RQ             59 completed   |   1 rate_deferred
Pull_ListReservations_RQ     190 completed   |  10 rate_deferred
Pull_GetLeads_RQ             187 completed   |   8 rate_deferred
```

- Every deferred row has `transport_status = rate_deferred` and no ResponseID: the request never left ROL'OS, so the channel was never abused.
- The last price deferral is 22:37; price pulls kept completing until 22:38 — the deferred reads were replayed, not lost.
- Background queue: 1,833 rows `done`, 0 waiting, 2 `failed`.

So: healed, by design. The problem is purely that the log presents them as failures.

## What actually needs fixing

1. **Deferrals are painted red.** The exchange log renders any row with `success = false` as a red "Failed" badge with a red row tint, and counts it in the failure stats. A throttle deferral is a third outcome, not a failure — which is exactly why this looked like a live error storm.
2. **Two stale queue rows sit as `failed`** from 16:21 with terminal, expected channel answers ("Reservation does not exist", "PropertyID ... doesn't match the property id of existing reservation"). These can never succeed on retry, so they should be closed as no-ops rather than lingering as failures.

## Changes

**Exchange log (UI only)**
- Add a third outcome: rows with `transport_status = 'rate_deferred'` render as an amber **Deferred** badge with no red tint.
- Add "Deferred" to the outcome filter alongside Success / Failed, so RU IT can isolate or exclude throttle noise during certification.
- Activity summary counts three buckets (completed / deferred / failed) and stops folding deferrals into the failure count.
- Row detail states plainly that the call was held locally by the sliding-minute gate and replayed by the background drainer.
- CSV export gains an `outcome` column so exported logs carry the same distinction.

**Queue hygiene (backend, small)**
- In the queue drainer, classify terminal channel answers ("reservation does not exist", "PropertyID ... doesn't match") as `no_op` instead of `failed`, so they stop retrying and stop reading as defects — matching the treatment already used for the same messages in booking sync.
- Close the two existing rows as `no_op`.

## Not changing

The gate itself, its 60-second window, the 25s wait ceiling, the deferrable-action list, or the drain cadence. They are behaving correctly and are covered by the adapter locks.

## Technical detail

- Files: `src/components/admin/channel-monitor/RuApiLogPanel.tsx` (outcome derivation, filter, summary, export), `supabase/functions/cron-ru-call-queue-drain/index.ts` (terminal-error classification), plus a one-off status update for the two rows.
- Outcome derived from the existing `transport_status` column — no schema change, no new query shape.
