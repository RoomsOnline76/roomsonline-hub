# Fix: rate-limit gate bypassed on the "push all properties" run

## What actually happened

The gate exists and works. The push path never lets it do its job.

Every unit create in a property push first reads the owner's whole listing list (`Pull_ListOwnerProp_RQ`) so it can adopt instead of duplicating. That read is issued **once per unit**, with byte-identical parameters — so the gate's method key is identical for all of them and the channel's one-call-per-sliding-minute rule refuses units 2..N. Confirmed in code:

- `rentalsunited-api` (push_property, adoption pre-read) calls the list pull per unit and, when the gate defers, converts it to a hard `RU_ADOPTION_UNVERIFIED` error with no `retry_after_ms` — the deferral information the gate produced is discarded.
- `push-property-to-ru` invokes creates through `invokeRuWithRetry`, which already owns a rate-limit backoff ladder (20s/45s/70s), but a create is forced to `maxAttempts: 1` (correct, to avoid duplicate listings). So the pre-read deferral — which proves *nothing was created* — is never retried either.

Result: "Fonteinhutte 8/9 — Galjoen: Channel rate limit … retry in 27s".

## Fix (no new features, three targeted changes)

1. **Stop making the same call N times** — `rentalsunited-api`: memoise the owner's listing snapshot for the gate's own sliding window (keyed by owner id, TTL = `RU_RATE_WINDOW_SECONDS`). The first unit pays for the read; the remaining units of the same push adopt from that snapshot without touching the channel. This removes the cause rather than retrying around it.
2. **Stop discarding the deferral** — when there is no snapshot and the gate does defer, return the deferral as such: keep `RU_ADOPTION_UNVERIFIED` but carry the gate's `retry_after_ms` and the `RU_RATE_DEFERRED` marker in the error body, so a caller can pace instead of guessing.
3. **Let the existing ladder run for this one safe case** — `push-property-to-ru`: a create refused at the adoption pre-read never reached the create call, so retrying cannot duplicate. Re-attempt those (and only those) through `invokeRuWithRetry`'s existing rate backoff ladder, honouring the returned `retry_after_ms`. All other create failures keep their single attempt.

## Technical notes

- Files: `supabase/functions/rentalsunited-api/index.ts` (push_property adoption block ~2665-2700), `supabase/functions/push-property-to-ru/index.ts` (unit push ~4744, property push paths using `invokeRuWithRetry`).
- No schema change, no new table, no new UI, no new cron. `ruRateGate.ts`, `ru_call_queue` and `ruInvokeRetry.ts` are used as built.
- Snapshot is in-process per warm worker; if a cold worker misses it, step 3's ladder covers the gap, so a full-portfolio push finishes in one run instead of leaving one unit unpublished.
- Verification: re-run "Push all properties on this account" for the Jongensfontein owner and confirm Fonteinhutte reports 9/9 with no `RU_ADOPTION_UNVERIFIED` rows, and that only one `Pull_ListOwnerProp_RQ` per owner appears in the channel call log for the run.
