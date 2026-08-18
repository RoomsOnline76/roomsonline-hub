# Fix the refresh-time Pricing 365d regression

## Goal
Keep RU Test Clone A’s authored 365-day pricing marked ready while it is waiting for the remaining unit listings to be published, and verify currency only after a live listing exists to verify.

## Confirmed diagnosis
- The property has complete local pricing: **1098/1098 unit-days priced** across its three currently linked units.
- After refresh, the live phase response adds `currency_verified` to **Pricing 365d** and fails it because ZAR is recorded but no live listing currency has been read back.
- The property-level listing ID is still empty and six of nine units are unpublished, so this read-back cannot complete yet. This makes post-publish verification block the pre-publish action that would create the listings.

## Changes
1. **Separate pricing readiness from currency verification**
   - Keep `Pricing coverage — rolling 365 days` limited to positive 365-day rate coverage and valid unit-to-rate-plan links.
   - Do not place a not-yet-possible live currency read-back failure inside the pricing-coverage group.

2. **Gate currency at the correct onboarding stage**
   - Treat the currency decision as sufficient before the first/full listing publish.
   - Keep live currency read-back mandatory once a verifiable channel listing exists, surfaced in the existing currency verification step rather than as a false rate-coverage failure.

3. **Make refresh results stable**
   - Ensure the fast stored/local response and explicit live refresh apply the same lifecycle rule, so the readiness state does not briefly pass and then regress for a circular dependency.
   - Replace the stale stored phase result after re-scoring.

4. **Regression coverage and live verification**
   - Add focused tests for complete local prices with no listing ID, partial multi-unit publication, and a fully published listing with an actual currency mismatch.
   - Deploy the readiness function and re-score RU Test Clone A, confirming Pricing 365d remains passed while genuine unpublished-unit blockers remain visible.

## Technical scope
- `supabase/functions/_shared/ruReadiness.ts`: lifecycle-aware currency check semantics.
- `supabase/functions/ru-cert-portal/index.ts`: determine whether currency read-back is actually verifiable and keep phase grouping consistent.
- `supabase/functions/_shared/ruReadiness.test.ts`: regression cases.
- No changes to locked channel adapter or push code.