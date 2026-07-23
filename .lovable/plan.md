## Finding
`commission_rate` and `transaction_fee_percentage` are **not** the same:

- **Commission rate** — ROL's revenue-share on the booking value (marketplace fee). Applied by `default`, `widget`, `rolos_pms`, `portfolio_aggregator`, `volume_tiered`.
- **Transaction fee %** — Payment-processing fee charged when Rooms Online PayFast is the payment facilitator (pass-through of card/gateway cost). Applied by `payment_facilitator` strategy and whenever `payment_facilitator_enabled` is on.

Both can apply on the same booking. Keep both, but clarify the UI so they can't be confused.

## Changes

### `src/components/property/BillingConfigTab.tsx`
1. Relabel and add helper text under each input:
   - **Commission rate** → *"Commission rate (% of booking)"* with hint: *"ROL's share of the booking value. Used by Default, Widget, ROL'OS PMS, Portfolio Aggregator and Volume Tiered strategies."*
   - **Transaction fee %** → *"Payment facilitator fee (% of transaction)"* with hint: *"Card/gateway pass-through charged only when Rooms Online PayFast processes the payment."*
2. Conditionally hide the field that doesn't apply to the selected strategy:
   - Hide **Commission rate** when strategy is `enterprise_white_label` or `payment_facilitator` (they don't take commission).
   - Hide **Transaction fee %** unless `payment_facilitator_enabled` is true OR strategy is `payment_facilitator`. Otherwise show a read-only note that it's only active when the Payment Facilitator toggle is on.
3. Add a one-line info banner at the top of the fees section: *"Commission and Payment Facilitator fee are separate charges and can both apply on the same booking."*

### `src/components/property/AdminOverviewTab.tsx`
Update the existing Billing Model rows to mirror the new labels ("Commission (booking %)" / "Payment facilitator fee (transaction %)") and hide each row when it isn't applicable to the current strategy/facilitator toggle.

### `src/pages/AdminBillingDefaults.tsx`
Same label refresh on the global defaults inputs (`default_commission_rate`, `default_transaction_fee`) so the terminology is consistent.

## Out of scope
- No schema changes; both columns stay.
- No changes to `calculate-billing` / `calculate-commission` edge functions — they already treat these as distinct fees.
