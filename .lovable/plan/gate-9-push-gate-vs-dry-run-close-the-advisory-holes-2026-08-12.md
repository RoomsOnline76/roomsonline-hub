# Gate #9 — Push gate vs dry-run: close the advisory holes

Audit result: the gate is **partly advisory**. Three real holes, all confirmed in code.

## What is already correct

- `push-property-to-ru` refuses a live push with `422 NOT_READY` when mandatory gaps exist (multi-unit at index.ts:3870, single-unit at index.ts:4548) and `422 PHASE_BLOCKED` when the phase gate is not `ready_for_push` (index.ts:3822), and it writes an audit row for the refusal.
- The bookable-window / MinStay rules feed the same gate as the content rules, so the wizard and the push agree on "ready".
- The dry run (`dry_run: true`) returns the same `mandatoryGaps()` the live gate uses — same rules, no second opinion.

## Hole 1 — the Push button is not gated on `usePropertyReadiness()`

`PushToRentalsUnited` never calls `usePropertyReadiness`. It gates on a `readiness` prop supplied by `RuReadinessScorecard` via `onReport`, and the condition is `readiness?.blocked === true`. Consequences:

- While the scorecard is still loading, and whenever its fetch fails (it calls `onReport(null)` on error), `readiness` is `null` → the button is **enabled**.
- The component is only gated where the scorecard is rendered beside it. Any other mount point has no gate at all.

Fix: consume `usePropertyReadiness(propertyId)` inside `PushToRentalsUnited` and block unless it has loaded **and** reports passed. Unknown/loading/error = blocked (fail closed), with the reason in the button title. Keep the scorecard report as an additional blocker, never as the only one.

## Hole 2 — the dry run is optional

`pushToRU()` calls the push driver directly. The disabled condition `validation !== null && !isReady` only bites if the user happened to press "Validate" first — pressing Push on a fresh panel skips the dry run entirely.

Fix: `pushToRU()` runs the server dry run first, stores its result in the same state the panel renders, and aborts with the returned `gaps` if any mandatory gap comes back. The live push only starts after a clean dry run from the same session.

## Hole 3 — the server gate fails open

Two server-side issues:

- The readiness pre-scoring block (index.ts:3399-3428) is wrapped in `try { … } catch { console.warn }`. If scoring throws (image probe, calendar read, RU lookup), `precomputedGaps` stays `[]` — the multi-unit gate at :3871 then sees zero gaps and the push proceeds unscored. It also feeds `evaluatePhases`, so phase 2 passes for the same reason.
- `force: true` (index.ts:2625) bypasses both gates and is not role-checked; the function performs no JWT validation at all. No internal caller uses `force`, so it is a client-supplied override today.

Fix:
- On a scoring exception, refuse the live push with `422 READINESS_UNVERIFIED` (dry runs and `refresh_ari` keep their current behaviour), and log the underlying error.
- Add the window gaps to the single-unit gate too, so both paths gate on the same set.
- `force: true` requires a caller JWT resolving to `admin` / `developer` / `fearless_leader` via `has_role`; otherwise `403 FORCE_NOT_PERMITTED`. Every force override keeps writing its existing audit row, now with the acting user id.

## Technical notes

Files touched:

- `src/components/property/PushToRentalsUnited.tsx` — add `usePropertyReadiness`, fail-closed disabled logic, dry-run-before-push in `pushToRU()`.
- `supabase/functions/push-property-to-ru/index.ts` — scoring failure becomes a refusal, single-unit gate gains window gaps, `force` role check.

No schema changes. No change to what counts as ready — only to whether a failure to prove readiness can be ignored.
