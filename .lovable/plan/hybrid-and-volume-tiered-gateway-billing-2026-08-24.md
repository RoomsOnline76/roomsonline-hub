# Hybrid and volume-tiered gateway billing

Today the payment-gateway fee a property pays is a single percentage: `property_billing_configs.transaction_fee_percentage` → `billing_global_defaults.default_transaction_fee` → a 2.5% fallback. There is no per-transaction fixed fee, no monthly platform component and no volume banding for gateway fees anywhere (the existing `volume_tiered` strategy bands *commission* by unit count, not by processed volume). PayFast Aggregation costs us 3.2% + R2 per transaction, so a flat 2.5% is under water on small tickets.

This change introduces a versioned gateway billing schedule, one resolver everybody reads, and contract wording that quotes the exact schedule — without touching PayFast signature, ITN or onsite logic.

## 1. Versioned billing schedule (source of truth)

New table `gateway_billing_configs`:

- identity: `name`, `version`, `is_active`, `effective_from`, `currency` (default `ZAR`)
- `model`: `flat` | `hybrid` | `volume_tiered` | `passthrough_plus`
- `base_percentage`, `fixed_fee_per_txn`, `monthly_platform_fee`, `passthrough_markup_percentage`
- `volume_tiers` jsonb — `[{ min_monthly_volume, max_monthly_volume, percentage, fixed_fee }]`
- audit: `created_at`, `updated_at`, `created_by`, plus a change log row on every version

Rows are immutable in practice: editing an active config creates a new `version` and flips `is_active`, so a signed contract can always be re-resolved against the version it quoted.

Seeded active default (commercially safe against 3.2% + R2):

| Monthly processed volume | Rate |
| --- | --- |
| R0 – R50 000 | 3.9% + R2.50 |
| R50 001 – R250 000 | 3.6% + R2.00 |
| R250 001+ | 3.4% + R1.50 |

Model `hybrid`, `monthly_platform_fee` 0 on the default so nothing changes commercially for anyone until a property is explicitly moved onto it.

## 2. Property / portfolio assignment and the resolver

- `property_billing_configs` and `portfolio_billing_configs` each gain `gateway_billing_config_id` plus optional overrides (`gateway_percentage_override`, `gateway_fixed_fee_override`).
- New `src/lib/gatewayBillingRate.ts` with a pure `getEffectiveBillingRate(config, amount, periodVolume?)` returning `{ percentage, fixed_fee, monthly_fee, effective_rate, config_version, model, tier }`, plus a thin async loader that resolves property override → portfolio → active global config.
- A mirrored copy lives in `supabase/functions/_shared/gatewayBillingRate.ts` so edge functions share the same maths (same pattern as the existing `expectedBilling` / `paymentModel` shared modules).
- Wired into: `calculate-billing` (facilitator surcharge now percentage + fixed fee, and volume-banded on the property's trailing-30-day processed volume), `generate-payout-statements`, `usePropertyPayouts`, `src/lib/billingExpected.ts` and the admin overview card — so the quoted number and the invoiced number agree.
- Feature flag `gateway_billing_v2`: when off, every caller keeps the current flat-percentage path. Rollout is per property by assigning a config.

## 3. Contracts

`src/lib/contractBillingVariables.ts` gains `billing_model`, `billing_percentage`, `billing_fixed_fee`, `billing_monthly_fee`, `billing_volume_tiers_summary`, `billing_config_version`, resolved from the property's effective schedule at generation, preview and send-for-signature time. The facilitator clause is rewritten to quote the resolved schedule (including the tier table when the model is banded) instead of a bare percentage. `ContractBillingSummary.tsx` shows the schedule as its own block, and the variables panel in `ContractManagementPanel.tsx` lists the new names. Existing `contract_templates` / `contract_template_versions` immutability is untouched; already-signed contracts keep their stored content.

## 4. Admin surface

- New section on `/admin/billing-defaults`: list of gateway schedules, editor for the active one (model, percentages, fixed fee, monthly fee, tier rows), "Create new version" action, and a roster of which properties/portfolios sit on each config.
- `BillingConfigTab.tsx` (property) and the portfolio billing card show the resolved effective rate read-only, with the schedule selector and override fields enabled only for admin / dev / `fearless_leader`.

## Out of scope

No changes to `payfast-api` request signing, ITN handling or onsite payment flow; no new gateways; booking UX only reflects a changed total where a fee is already surfaced.

## Technical notes

- Migration is additive: one new table with GRANTs (`authenticated` read, `service_role` all, admin-gated writes via RLS using `has_role`), plus nullable columns on the two billing-config tables. No backfill changes anyone's current rate.
- Edge functions to redeploy: `calculate-billing`, `generate-payout-statements`, `billing-subscription-cron`, `subscription-billing-actions`.
- Unit tests for `getEffectiveBillingRate` covering flat, hybrid, each volume band, band boundaries, override precedence and the `passthrough_plus` markup — alongside the existing `commissionResolver.test.ts` merge gate.
- Verification: one property per model — confirm the generated `billing_transactions` lines, the payout statement deduction and the rendered contract clause all quote the same schedule and version, and that a PayFast test payment still processes unchanged.
