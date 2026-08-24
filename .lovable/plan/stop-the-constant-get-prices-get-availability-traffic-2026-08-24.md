# Stop the constant `get_prices` / `get_availability` traffic

## What is actually happening

The channel reads are not coming from a cron job. Queue volume tracks working hours (peaks of ~180/hour this afternoon, near zero overnight), and 4,906 `get_prices` plus 1,269 `get_availability` calls have been queued since 16 Aug. They are triggered by page loads.

Verified origin:

- `ru-cert-portal → property_readiness` scores with `body.probe_ari !== false`, i.e. a **live channel probe is the default** when the caller omits the flag (`supabase/functions/ru-cert-portal/index.ts:2498`).
- `usePropertyReadiness` calls exactly that action with **no** `probe_ari` (`src/hooks/usePropertyReadiness.ts:230`), on a 60s-stale query that runs on every property editor / wizard mount where channel checks are on.
- Each probe fires `get_availability` + `get_prices` per RU listing (`index.ts:1908/1911`) — 8 calls for a 4-unit property, which matches the log burst at 19:12.
- The only guard is `ariProbeCache`, a 180s **in-memory** map in a short-lived edge isolate, so it almost never hits. The durable `ru_readiness_snapshots` copy is only consulted by `phase_status`, never by `property_readiness`.
- Both actions are on the deferrable list, so every probe is parked in `ru_call_queue` and replayed by the per-minute drain — that is the queue screen you are looking at.

## The fix

1. **Flip the default to off.** In `property_readiness`, probe only when the caller explicitly sends `probe_ari: true`. Omitting the flag scores locally (`scoreProperty(..., { probe_ari: false })`). Same treatment for the `phase_status` "no stored verdict yet" auto-probe, which also probes without being asked.
2. **Durable snapshot guard in the scorer.** Inside `scoreProperty`, before probing, read `ru_readiness_snapshots`; if the stored ARI verdict is fresher than a TTL (6 hours) reuse it and skip the channel calls entirely, unless the caller passes `force_probe: true`. This survives cold starts, which the in-memory cache does not.
3. **Client callers become explicit.**
   - `usePropertyReadiness` sends `probe_ari: false`.
   - `useChannelReadiness` currently fires a second, always-live query on mount; it has no consumers left, so remove its live probe (keep the local query) rather than leaving a loaded gun in the tree.
   - Operator-initiated paths keep live probes: the Onboarding queue "Re-check" (`AdminOnboarding.tsx:431`), the wizard's explicit channel recheck, the price-coverage "Re-check" button, and the certification console suites.
4. **Do not queue read probes.** When a readiness probe comes back rate-deferred (202/queued), it should not sit in `ru_call_queue` for five replayed attempts — the scorer already falls back to the last good XML. Readiness probes will be sent with `deferrable: false` so a throttled read is dropped instead of amplified.

## Result

Opening a property, the wizard, or the onboarding queue costs zero channel calls. Live prices/availability reads happen on operator action, on the existing 6-hourly ARI refresh, and on post-push verification — nothing else. The background call queue should drop to near-empty between deliberate actions.

## Technical notes

- Files: `supabase/functions/ru-cert-portal/index.ts` (probe defaults, snapshot TTL guard, probe body flags), `src/hooks/usePropertyReadiness.ts`, `src/hooks/useChannelReadiness.ts`.
- No schema change; `ru_readiness_snapshots` already stores `groups` + `probed_at`.
- Verification after the change: re-open a property editor and the onboarding queue, then confirm no new `get_prices` / `get_availability` rows appear in `ru_call_queue`, and that an explicit "Re-check" still produces exactly one pair of calls per listing.
