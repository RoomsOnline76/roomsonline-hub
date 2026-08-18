# Stop rate-limited channel reads from failing gates that already passed

## What the data proves

Nothing is wrong with the Jongensfontein properties, and no gate is genuinely violated.

Fonteinhutte's stored gate payload blocks on one unit:

- "Kaapse Noontjie: Longest run of open, priced days is 0 (need 3); 0 open day(s), 0 of them unpriced"
- "Kaapse Noontjie: No MinStay value reached the channel for the affected unit"

The channel's own responses for that same unit (`5806507`), read minutes earlier, say the opposite:

- Availability: `Status ID="0" Success`, 63 183 bytes, `CalDay ... Units="1"` with `IsBlocked=false`, `MinStay=1`, `MaxStay=30` across the rolling year.
- Pricing: `Status ID="0" Success`, ten contiguous seasons from 2026-08-18 through 2027-08-18 at 1010 / 1230 / 2120.

In the same window the call log shows repeated `429 RU_RATE_DEFERRED` for both calls ("called with the same parameters less than a minute ago"). The readiness snapshot written at 19:51:37 recorded zeroes — those zeroes come from the deferred calls, not from the channel.

So the scorer is treating a rate-limited deferral as an answered calendar containing zero open days and no MinStay, and that fabricated zero is what blocks the wizard.

The push itself is complete: the payload lists all nine unit IDs (5806492–5806518) with `inventory_push_at` recorded, and phase 4 already reads `verified: true`. Phases 3 and 4 show as pending only because phase 2 is blocked upstream. That is why the wizard stalls on "Push property / Fetch channel manager IDs" for work that is already done.

## The fix

1. **A deferred read is never evidence.**
   A `429`/`RU_RATE_DEFERRED` (or any queued, empty, or errored payload) must not be counted as availability or pricing answered. Only a real `Status ID="0"` response carrying a calendar or price body may produce open-day, MinStay and priced-day numbers.

2. **Reuse the successful read instead of re-probing.**
   When a good response for a unit already exists inside the channel's own repeat window, score from it rather than firing a duplicate call that is guaranteed to come back rate-limited. This uses the existing rate gate and call-queue rather than adding anything new.

3. **Never overwrite a good verdict with a deferred one.**
   Deferred reads leave the last valid per-unit verdict in place in the readiness snapshot and phase payload. A genuinely closed or unpriced unit still blocks; a unit that could not be read is reported as "not re-checked", not as failed.

4. **Phase 3 and 4 reflect recorded reality.**
   With phase 2 passing on real evidence, the pushed unit IDs and the existing verification timestamp let the wizard show push and verification as complete, leaving the live-connector step as the only remaining work.

## Verification before reporting back

- Re-score all four Jongensfontein properties and confirm no unit reports 0 open days or missing MinStay while the channel is returning full calendars.
- Confirm the stored snapshot for Fonteinhutte lists Kaapse Noontjie as open and priced.
- Confirm a deliberately rate-limited re-score changes nothing in the stored verdict.

## Technical scope

- `supabase/functions/ru-cert-portal/index.ts` — treat deferred/queued/empty ARI responses as "not read"; reuse the recent successful read; do not persist zero-day windows from unread units.
- `supabase/functions/_shared/ruReadiness.ts` — evidence classification for deferred versus answered responses.
- `supabase/functions/_shared/ruReadiness.test.ts` — regressions for: deferred 429 cannot fail a unit; a real empty calendar still fails; the real Kaapse Noontjie response passes.

No property, unit, rate, or calendar data changes. No new feature.
