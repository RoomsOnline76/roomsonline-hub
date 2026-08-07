# Rate Plans Verification Regime — Final Merge Gate

Goal: prove the unified Rate Plans work changes nothing for existing properties (all still `rate_resolution_mode = 'legacy'`), and that the new path is correct where it is switched on. Every item below produces a recorded PASS/FAIL artifact in `docs/verification/rate-plans-2026-08-07.md`.

## Current state (verified before writing this plan)

- Only two automated test files exist: `supabase/functions/_shared/ratePricing.test.ts` (19 tests) and `ruPriceParsing.test.ts`. Deno test runner only.
- There is no frontend test harness (no `vitest.config.ts`, no `src/test/setup.ts`, no `test` script in `package.json`), so "all existing unit + integration tests" for booking / ARI / reporting / billing / commissions do not exist yet — they have to be written as part of this gate.
- The kill switch is `properties.rate_resolution_mode` read by `supabase/functions/_shared/rateParity.ts`; shadow drift is logged to `rolos_rate_resolution_audit`.
- SQL compatibility checks already exist in `scripts/verify-rate-compat.sql`.

## 1. Automated suite

### 1a. Harness
- Add vitest + jsdom + testing-library, `vitest.config.ts`, `src/test/setup.ts`, `test` script (frontend layer).
- Keep Deno tests as-is for edge/shared logic.

### 1b. Pure-logic unit tests (Deno, no network)
- Extend `ratePricing.test.ts`: plan-season absolute vs differential (amount/percent), unit differentials stacking, daily override precedence, rack/unit fallback, min/max stay cascade, inactive plan exclusion, unpriced-night behaviour.
- New `rateResolution.test.ts` with injected fixture loaders (no live DB): assert tier ordering and that legacy mode output is byte-identical to the pre-change resolver for the same fixtures.
- New `rateParity.test.ts`: mode defaults to `legacy` on missing/unknown values and on lookup failure.
- Reporting / billing / commission logic tests around `_shared/revenueStreams.ts`, `revenueStatuses.ts`, `commissionResolver`, and `calculate-commission` pure helpers — asserting rate changes cannot move net accommodation, commission base, or BYO settlement split.

### 1c. Frontend unit tests (vitest)
- `ratePlanDraft.ts` reducer/`draftToPayload` round-trip, including season modes and unit differentials.
- `RatePlansSurface` renders read-only mode with no mutation handlers wired (guards the Admin ROL'OS gate).

### 1d. ARI snapshot tests
- New `supabase/functions/_shared/ariSnapshot.test.ts` plus committed golden fixtures under `supabase/functions/_shared/__fixtures__/ari/`.
- Fixtures captured from real properties via read-only queries: one single-unit, one multi-unit, one shared-calendar portfolio (Jongensfontein-style: siblings sharing seasons, different unit rates), one with daily overrides.
- The test builds the ARI payload (prices + restrictions per unit per day, 365-day window) through the current code path and diffs against the golden file. Any diff fails the gate until explicitly re-baselined with a written justification.
- Also assert legacy-vs-unified payload equality for the same fixture where the data is fully migrated, so switching a property's mode is provably a no-op on ARI.

### 1e. Live shadow-drift check (read-only)
- Query `rolos_rate_resolution_audit` for drift rows in the last 7 days grouped by property and tier, and `scripts/verify-rate-compat.sql`. Gate = zero unexplained drift; every remaining drift row documented with cause.

## 2. Manual critical paths (executed with Playwright against the running app, screenshots recorded)

Each step records: route, inputs, expected number, observed number, screenshot path, PASS/FAIL.

1. Create + edit a Rate Plan in ROL'OS → same nightly amounts appear in the editor Live Preview, the Calendar preview, and the public booking widget for the same dates.
2. Paint a new season on the Calendar → the referencing Rate Plan picks up the new season immediately (sync action), and preview + widget move to the new amount.
3. Book a reservation on that plan → confirm quoted total, enforced min stay, and folio/room-night rows match the engine amount.
4. Push ARI to the connected channel / channel-manager account → confirm pushed rates and restrictions equal the engine output for the same window (compare push payload log to the preview).
5. Run one revenue report and one commission calculation on a fixed date range, before-change baseline captured first from current production data → numbers must be identical.
6. Toggle a Rate Plan inactive → it disappears from the booking widget and from the next ARI payload; availability itself unchanged.
7. Shared-calendar property with different unit rates → each unit shows its own correct price on preview, widget, and ARI.

Any step touching a live channel push runs against a test/child account only; nothing is pushed for a property not already connected.

## 3. Rollback plan (documented in `docs/verification/rate-plans-rollback.md`)

1. Per-property instant fallback: set `properties.rate_resolution_mode = 'legacy'` (single UPDATE). All resolvers immediately use the pre-change legacy tiers; no deploy needed.
2. Global fallback: set every property to `legacy` in one UPDATE, then confirm `SELECT count(*) FROM properties WHERE rate_resolution_mode <> 'legacy'` returns 0.
3. Data rollback is unnecessary: Phase 2 was additive. `rolos_rate_plans`, `rolos_rate_plan_season_rates`, `rolos_shared_seasons`, `rolos_stay_restrictions` are new tables; legacy `rolos_rate_prices` / `properties.amenities.seasons` continued to be written on every save, so the legacy path stays authoritative and complete.
4. UI fallback: the Admin legacy Rate Types / Seasons / Rate Breakdown sub-tabs are hidden only for ROL'OS properties by a gate in `RateManagerTab.tsx`; reverting that one condition restores the old editing surface without any data work.
5. If a specific plan is bad rather than the path: deactivate it (soft-delete flag) — it drops out of booking and ARI on the next push.
6. Verification after rollback: re-run `scripts/verify-rate-compat.sql` plus the ARI snapshot suite; both must be green.

## Exit criteria

The work is mergeable only when: every automated suite green; zero unexplained parity drift; all seven manual paths recorded PASS with screenshots; report + commission numbers identical to baseline; rollback doc committed.

## Technical notes

- No production data is mutated by the automated suite; ARI fixtures are captured read-only and committed as JSON.
- Manual paths use a designated test property (and a child channel account) so real inventory is never sold or blocked.
- New test files: `ratePricing.test.ts` (extended), `rateResolution.test.ts`, `rateParity.test.ts`, `ariSnapshot.test.ts`, `ratePlanDraft.test.ts`, `RatePlansSurface.test.tsx`, plus revenue/commission logic tests.
