---
name: Gateway Billing Schedules
description: Versioned hybrid/volume-tiered payment-processing schedules — one resolver for checkout fees, payout deductions, contracts and admin previews
type: feature
---

# Gateway billing schedules

`gateway_billing_configs` is the versioned source of truth for what ROL charges to
process a payment. Models: `flat`, `hybrid`, `volume_tiered`, `passthrough_plus`
(acquirer cost + markup). Bands live in `volume_tiers` jsonb and are selected on
trailing-30-day paid booking value for the property.

## One resolver, two copies

- Frontend: `src/lib/gatewayBillingRate.ts`
- Edge: `supabase/functions/_shared/gatewayBillingRate.ts`

The pure functions must stay behaviourally identical — a quoted fee and an
invoiced fee may never diverge. `src/lib/gatewayBillingRate.test.ts` is the merge
gate (band boundaries, overrides, passthrough, null schedule, zero amount).

Resolution order: property assignment → portfolio assignment → active global
schedule. Overrides (`gateway_percentage_override`, `gateway_fixed_fee_override`)
come from whichever level supplied the schedule. `flat` never charges a fixed fee.

## Rollout gate

`calculate-billing` and `generate-payout-statements` use the schedule **only** when
the resolved source is `property` or `portfolio`. Unassigned properties keep the
legacy flat `transaction_fee_percentage` path, so rollout is per property with no
global flag. Actual gateway-charged fees on a booking still win over any schedule.

## Contracts

Contract variables `{{billing_model}}`, `{{billing_percentage}}`,
`{{billing_fixed_fee}}`, `{{billing_monthly_fee}}`,
`{{billing_volume_tiers_summary}}`, `{{billing_config_version}}` and
`{{billing_schedule_clause}}` are emitted only for ROL-processed properties, and
always quote the schedule version that will actually be applied.

## Adapter isolation

No PayFast API surface is touched: `PAYFAST_COST_PERCENTAGE`/`_FIXED_FEE` are cost
constants for margin checks only. All PayFast communication stays in `payfast-api`.
