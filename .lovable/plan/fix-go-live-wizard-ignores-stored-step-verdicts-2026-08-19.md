# Fix: Go-Live wizard ignores stored step verdicts

## What is actually happening

The stored verdict table is empty of verdicts. Every property that has ledger rows (5 properties x 14 steps = 70 rows) is sitting at `status = pending`, with `passed_at` and `last_checked_at` both null. The rows were seeded but never graded.

The wizard's ledger overlay then does this: if a ledger row exists, the row decides the step; a `pending` row with no `passed_at` counts as **not complete**. So a step that local data says is finished (e.g. step 11, listing IDs read back) is forced back to incomplete and the wizard asks to fetch Channel Manager IDs again.

Two defects combine:

1. **`pending` overrides local truth.** The overlay was written for `passed` / `blocked` / `stale` / `unknown`. A never-graded `pending` row should fall back to the locally computed verdict, not veto it.
2. **Nothing ever grades a seeded row.** Seeding creates `pending` rows, but the background drain only picks up rows with `status = 'stale'`, so `pending` rows never get a first verdict and stay veto-ing forever.

## Fix

**1. Treat `pending` as "no verdict yet"**
- In the wizard overlay, use the ledger row only when it carries a real verdict (`passed`, `blocked`, `stale`/`unknown` with a prior `passed_at`). For `pending` with no `passed_at`, use the locally computed completeness.
- Apply the same rule to the portfolio-level reader used by the Onboarding list so a seeded-but-ungraded property isn't reported as un-started.

**2. Grade seeded rows once**
- Extend the background drain to also pick up `pending` rows that have never been checked (`last_checked_at is null`), same per-property batching and local-only probe as the stale drain.
- When the wizard seeds a property lazily, immediately follow with one recheck so the first visit records verdicts instead of leaving 14 pending rows.

**3. Backfill**
- Run one recheck pass over the existing 70 pending rows so the current properties (including the one at 92%) get real verdicts recorded now rather than waiting for the next cron tick.

## Result

- A property whose steps 1-13 already passed opens straight into step 14 with no channel calls.
- Step 11 stops re-asking for Channel Manager IDs once the read-back verdict is recorded.
- A rate-limited or throttled channel read still cannot un-complete finished work (unchanged behaviour for `stale` / `unknown`).

## Technical notes

- `src/hooks/useRolosOnboardingProgress.ts` — overlay at the `ledgerStepComplete` call site.
- `src/lib/channelStepLedger.ts` — `ledgerStepComplete` and the Phase 5 portfolio verdict reader.
- `supabase/functions/cron-channel-ledger-drain/index.ts` — widen the candidate query to ungraded `pending` rows.
- `supabase/functions/ru-cert-portal/index.ts` — no action-surface change; `ledger_recheck` / `ledger_drain_recheck` already persist verdicts.
- No schema change required.
