# Make the Gateway Schedule the Single Source for Card Processing

## Answer first: is the old gateway still wired in?

Yes — it is not redundant. It is still the only thing actually billing today.

Verified in the live data and the code:

- There is 1 active schedule (Standard Gateway Schedule v1, hybrid 3.9% + R2.50, banded down to lower rates at higher volume).
- 0 properties and 0 portfolios are assigned to it (`gateway_billing_config_id` is null everywhere).
- Both `calculate-billing` and `generate-payout-statements` only use a schedule when the resolved source is `property` or `portfolio`. A global-only match is treated as "not assigned" and falls through to the legacy flat percentage.
- 98 properties have the ROL facilitator surcharge enabled, and they are all being charged the legacy flat rate: `transaction_fee_percentage` on the property (set on 2 properties) or the global default of 3.50%.

At the same time, the contract variables and the new public Connect pricing page read the active global schedule directly. So today we quote 3.9% + R2.50 in contracts and on the website while the billing run charges 3.5% flat. That gap is the real problem to close.

## What changes

The schedule becomes authoritative for every ROL-processed property, assigned or not. The legacy percentage stops being a rate and becomes only a negotiated per-property override.

1. **Global schedule counts as assigned.** The resolver's `global` source is treated as a live schedule in billing and payouts, so unassigned ROL-processed properties are charged on the active schedule (3.9% + R2.50, volume-banded) instead of the flat 3.5%. Reservation-only and bring-your-own-gateway properties are untouched, and the gateway fee still never compounds on commission or add-ons.
2. **Negotiated rates are preserved.** The 2 properties carrying a custom `transaction_fee_percentage` get that value copied into their `gateway_percentage_override` so their agreed rate keeps applying under the new resolution. Nobody with a negotiated rate silently moves onto the standard band.
3. **Actual gateway cost still wins in payouts.** Where the gateway told us what it really charged on a booking, that figure continues to be used ahead of any schedule.
4. **The `payment_facilitator` billing strategy** (surcharge-only properties) also resolves from the schedule rather than the flat percentage, so there is one rate path in the system, not two.
5. **Billing Defaults / property billing UI:** the "ROL payment facilitator surcharge %" input becomes a read-only mirror of the resolved schedule rate — it shows the percentage, the fixed fee and which schedule and version it came from, with a link to Gateway Schedules. Rate editing happens only in Gateway Schedules; the per-property negotiated override stays editable on the property's gateway card. The payment-model selector (ROL processes / owner's gateway / none) is unchanged — that switch is still what turns processing on or off.
6. **Quoting matches billing.** Because contracts and the Connect portal already read the schedule, closing the resolution gap makes contract clauses, the public pricing table, TOBI and the invoice all quote the same number.

## Commercial impact to be aware of

This is a price change for the 98 ROL-processed properties: from 3.5% flat to 3.9% + R2.50 on the entry band, stepping down as monthly card volume grows. Their contracts and the public site already state the schedule rate, so this brings billing into line with what is published rather than introducing a new charge. If you would rather no property sees a change on day one, the alternative is to edit the active schedule's entry band to an effective 3.5% before this goes live — a one-field change in Gateway Schedules, no code difference.

## Technical notes

- `supabase/functions/_shared/gatewayBillingRate.ts` — `loadGatewaySchedule` keeps returning the source, and a shared helper decides that `property`, `portfolio` and `global` are all billable sources (only `none`, i.e. no active schedule at all, falls back).
- `supabase/functions/calculate-billing/index.ts` — the surcharge block uses the schedule for all three sources; the legacy flat insert survives only for `none`. `calcPaymentFacilitator` resolves through the schedule with the flat percentage as last resort.
- `supabase/functions/generate-payout-statements/index.ts` — same source test, so statement `transaction_fees` and the payout lines agree with `billing_transactions`.
- `src/lib/gatewayBillingRate.ts` — mirror the source helper so front-end previews (`billingExpected`, contract variables, revenue hooks) resolve identically.
- Data step (run_sql, not a migration): copy `transaction_fee_percentage` into `gateway_percentage_override` for property billing configs that have a custom value and no override yet.
- UI: `BillingConfigBuilder.tsx` renders the surcharge value read-only from the resolved schedule; `GatewayScheduleCard.tsx` remains the place for assignment and negotiated overrides.
- No schema change is required — the columns already exist. `transaction_fee_percentage` and `default_transaction_fee` stay in place as the fallback and as historical record for past transactions.
