Enforce two rules across the billing engine:

1. **Facilitator surcharge stacks on commission**, computed off the raw booking amount only (never off commission or other fees).
2. **Sales-rep commissions ignore facilitator surcharge revenue** — reps earn only on ROL's commission/subscription revenue.

## Changes

### `supabase/functions/calculate-billing/index.ts`
- On every `event_type === 'booking'`, after the strategy calculator runs, if the property's payment model is "ROL facilitator" (i.e. `payment_facilitator_enabled` true / BYO off), additionally compute and log a `transaction_fee` transaction:
  - `rate = resolve(config.transaction_fee_percentage, globals.default_transaction_fee, 2.5)`
  - `amount = bookingAmount * rate / 100` (booking total only — not stacked on commission or add-ons)
  - `metadata: { rate, source: 'facilitator_surcharge', base: 'booking_amount' }`
- Keep the existing `payment_facilitator` strategy path but treat it as commission-less: it emits only the surcharge (no double-log). For all other strategies where facilitator is enabled, surcharge is emitted as a second transaction alongside the commission.
- Guard: if BYO gateway is active, do NOT emit surcharge (BYO monthly fee handled separately in subscription cycle).

### `supabase/functions/calculate-rep-commissions/index.ts` (line 95-102)
- Filter `billing_transactions` query with `.not('type', 'in', '(transaction_fee,facilitator_surcharge)')` so `baseRevenue` excludes facilitator income.
- Also exclude pass-through add-ons that aren't ROL earnings on the platform side: leave `commission`, `subscription`, `white_label_fee`, `pricelabs_fee`, `portfolio_aggregator_fee`, `portfolio_aggregator_setup` in scope; exclude `transaction_fee` and any `byo_gateway_fee` if later emitted.

### UI touch-ups (small, non-behavioural)
- `AdminOverviewTab.tsx` "Estimated Client Cost" already lists surcharge separately; add a one-line note under the surcharge row: *"Applied per booking on booking total only; stacks on commission."*
- `BillingConfigBuilder.tsx` facilitator toggle helper text: clarify "Charged per booking on the booking amount only. Does not compound on commission or add-ons. Sales reps do not earn commission on this fee."

## Out of scope
No schema changes. No changes to contract templates. Widget/volume-tiered strategies keep their existing rate resolution — surcharge simply layers on top when ROL facilitates.
