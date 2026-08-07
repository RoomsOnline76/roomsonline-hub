# Rates compatibility shim inventory

Date: 2026-08-07 · Companion to `docs/verification/rate-plans-merge-gate.md`

## Verified state (do not remove anything yet)

| Fact | Value |
| --- | --- |
| Properties on `rate_resolution_mode = 'legacy'` | 104 / 104 |
| `rolos_rate_plans` rows | 42 |
| `rolos_rate_plan_season_rates` rows | 0 |
| `rolos_shared_seasons` rows | 0 |
| `rolos_stay_restrictions` rows | 0 |
| `rolos_rate_prices` rows | 0 |
| `rolos_rate_resolution_audit` rows | 4 (shadow-only, all explained) |

The "legacy" path is therefore **not a shim** — it is the only path currently serving
prices to booking, ARI, channel push and reporting. Deleting the dual-write or the
legacy resolver tiers today would break every property. Nothing is removed in this
pass; each surface below carries the precondition that must hold first.

## Surfaces

| Surface | Kind | Live consumers | Precondition to delete |
| --- | --- | --- | --- |
| `trg_sync_rolos_rates_to_overview` / `sync_overview_rates_to_rolos` (`rolos_rate_plans` ↔ `properties.amenities.pms_rate_types`) | Bidirectional trigger pair | Admin Rates tab (non-ROL'OS), legacy resolver tiers, channel push | Admin mirror no longer reads `amenities.pms_rate_types`, and every property is `unified` |
| `trg_mirror_rate_plan_season_rate` (new plan-season rows → `rolos_rate_prices`) | Forward mirror | Dormant today; required the moment the Rate Plans editor is used on a legacy property | No property resolves through `rolos_rate_prices` |
| Legacy tiers in `supabase/functions/_shared/rateResolution.ts` (`calendar_season`, `rack`, `unit_daily`) | Resolver tiers | All 104 properties | Every property is `unified` and the ARI snapshot suite is green after re-baseline |
| `rateParity.ts` shadow logging + `rolos_rate_resolution_audit` | Safety net | Migration observability | Keep until the last property has been switched and observed for 30 days |
| Legacy writes emitted by `ratePlanDraft.ts` → `rolos-rate-plans` | Dual write on save | Legacy readers of `rolos_rate_prices` / `amenities` | Same as the resolver tiers |
| `rolos_v_effective_rates` | **Verification-only artifact** | None in application code — referenced solely by `scripts/verify-rate-compat.sql` check 5 and generated types | Retained deliberately; do not wire application code to it |

## Global preconditions before any deletion

1. `select count(*) from properties where rate_resolution_mode <> 'unified'` returns `0`.
2. Zero unexplained rows in `rolos_rate_resolution_audit` for 30 consecutive days.
3. `deno test --allow-read --allow-env supabase/functions/_shared/` and `npm test` green.
4. ARI golden snapshots re-baselined with a written justification for every diff.
5. `psql -f scripts/verify-rate-compat.sql` — 10 / 10 PASS.

Never roll back a pricing problem by deleting data. Flip `rate_resolution_mode` back to
`legacy` and investigate with the audit table.
