# Fix false Availability 365d onboarding blocks

## Confirmed current state

- Fonteinhutte is still blocked by `bookable_window`: one channel unit reports 366 open days but no price points, producing a 0-day bookable run.
- RU Test Clone A has the same false availability blocker. Clones B, C, and D currently pass the Availability 365d group in the stored readiness payload, so their remaining wizard blockers must be kept separate from availability.
- The previous safeguard only rejects a window when both `open_days` and `longest_run` are zero. It therefore incorrectly accepts an open-but-unpriced channel window as authoritative.
- All five properties have active Rack rate plans with a base rate and linked units; readiness must compare channel evidence with the canonical local Rate Plan resolver rather than allowing a partial channel read-back to invalidate locally complete coverage.

## Implementation

1. **Correct channel-window trust rules**
   - Replace the broad “meaningful window” check with explicit evidence states: bookable, genuinely closed, unpriced/incomplete, or unavailable.
   - Treat an open-but-entirely-unpriced result as incomplete channel evidence, not a final availability verdict, when the canonical local resolver has complete positive pricing.
   - Preserve genuine channel failures such as authored stop-sells or a locally unpriced/closed calendar; do not turn every failure green.

2. **Score every unit consistently**
   - Reconcile the live unit probe with the local Rate Plan result per active room type.
   - Do not let one partial/stale channel price response create a property-wide Availability failure when that unit has a valid local rate ready to push.
   - Keep Pricing and Availability independent so missing channel price verification is reported as pending under Pricing, rather than falsely blocking Availability.

3. **Align wizard and push gate**
   - Ensure the backend readiness endpoint, onboarding wizard group status, and live push gate consume the same normalized readiness result.
   - Remove reliance on a stale failed readiness payload after a successful fresh score and invalidate the wizard query after refresh/push actions.

4. **Recover and verify affected properties**
   - Re-score Fonteinhutte and RU Test Clones A–D after deployment.
   - Confirm Fonteinhutte and Clone A no longer show the false `0-day / 366 unpriced` Availability blocker.
   - Verify Clones B–D remain correctly passed for Availability and report only their actual independent blockers.
   - Confirm a deliberately unpriced test case still fails, preventing a permissive regression.

## Technical files

- `supabase/functions/ru-cert-portal/index.ts`
- `supabase/functions/_shared/ruReadiness.ts` and/or the shared local-window normalization helper
- `src/hooks/useRolosOnboardingProgress.ts` only if cache invalidation still retains the old readiness payload
- Focused readiness tests for open-but-unpriced, throttled, locally priced, and genuinely unavailable cases