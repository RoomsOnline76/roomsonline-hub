# Push the Jongensfontein portfolio to OwnerID 741761

## What the data shows

The Jongensfontein.com portfolio has one channel account, scoped to the **portfolio** (not to a single property): OwnerID `741761`, login `rooms@roomsonline.co.za`, API keys stored and verified at 22:42 today.

Account resolution already prefers the portfolio-level account before any property-level one, so **yes — an OwnerID and keys bound to one portfolio apply to every property in that portfolio.** Nothing needs to be re-entered per property.

The four properties in the portfolio:

| Property | Units | Last listing pull said | Push enabled |
| --- | --- | --- | --- |
| Dassiesingel Self-catering Units | — | (never pulled) | no |
| Fonteinhutte Self-Catering Chalets | 9 | OwnerID 741765 (stale) | no |
| Seesig Self Catering Chalets | 9 | OwnerID 741761 | no |
| Tidal Pools Self Catering Apartments | 4 | OwnerID 741765 (stale) | no |

Two properties still carry verification records from the old 741765 account, and the live 741761 account currently holds only 13 archived listings — so all four need a fresh push under 741761.

Dassiesingel's latest readiness snapshot reads `ready_for_push: true`, blocked only on "Not published yet — run Push". Readiness for the other three has not been snapshotted this session and gets re-checked as part of the run.

## What to build

1. **Portfolio-wide push action** — a "Push portfolio to channel" control on the channel monitor / onboarding view for a portfolio. It runs the existing resumable per-property push driver once per property, sequentially (never in parallel — the channel rate-limits one call per method per minute), showing per-property progress, batch counts and any per-property failure.

2. **Stale account records cleared on push** — when a property is pushed under 741761, drop the leftover 741765 verification fields so the wizard and monitor stop showing the old account.

3. **Skip-with-reason, not silent failure** — a property that fails its readiness gate is reported as skipped with its blockers listed, and the run continues with the next property.

4. **Then run it** for the four Jongensfontein properties and report, per property, the listings created under 741761 plus anything that could not be pushed.

## Technical notes

- Account resolution is `findOwnerAccount` in `supabase/functions/_shared/ruPhaseGate.ts`: `portfolio_id` match first, then `property_id`, then a global row by owner email. Portfolio inheritance is already the behaviour — no schema change.
- Pushes go through `src/lib/ruPushDriver.ts` (`push-property-to-ru`, chunked/resumable via `batch_id`). The new action loops the driver per property and aggregates results; it does not introduce a second push path.
- Stale fields to clear on a successful push: `properties.ru_listings_verified_owner`, `ru_listings_verified_units`, `ru_listings_expected_units`, `ru_listings_verified_at`.
- No database migration required.
