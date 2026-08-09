# Billing changes must always trigger the plan-change flow

## What went wrong for Jongensfontein

Verified against the live data:

- The portfolio billing record still has the ROL facilitator switched **on**, monthly fee resolved from the room tier, no pending plan, status `active`, period ending 2026-09-14.
- Its only paid subscription invoice is the activation of **R3 770,00** (this is the amount PayFast is charging).
- The billing change log is **empty** — no change event was ever recorded for this portfolio, which means the change-handling routine never ran when the payment facilitator was removed.

Two concrete causes, both confirmed by reading the code:

1. **A save path bypasses the billing engine.** The Payment Providers tab writes `payment_facilitator_enabled` (and the property's provider flags) straight to the database instead of going through the billing config save that calls the plan-change routine. So no change log, no fee comparison, no cancel/re-schedule, no emails. It also writes only the *property* record, while Jongensfontein is billed at *portfolio* level — so the effective billing config was never touched at all.
2. **Two different fee formulas.** The screen's "Estimated client cost" and the backend's monthly-fee resolver do not agree: the backend charges the channel-manager fee per **room** while the UI charges per sellable **unit**, and the backend ignores the enable flags the UI respects (white-label allowed, branding add-on, BYO gateway gated by payment model, annual/12 white-label). So even when the routine does run, the amount it compares against — and would bill — can differ from what is shown and from what PayFast holds.

There is also no visible alarm anywhere: nothing compares the contracted monthly fee with the amount actually being collected by PayFast.

## What to build

### 1. One save path for billing
Route every payment-model / provider change through the shared billing config save so the plan-change routine always runs, at the correct scope (portfolio when the property is portfolio-billed). The Payment Providers tab keeps its UI but delegates the billing side instead of writing directly, and it edits the effective (portfolio or property) config.

### 2. One fee formula
Make the backend use the same rules as the on-screen cost breakdown: shared tier/add-on logic, per-unit channel-manager fee, respect the allowed/enabled flags and the annual white-label split, and the three-way payment model for the gateway add-on. The number shown, the number billed and the number compared against PayFast then always match.

### 3. Drift detection on the ROL Account page
Add a mismatch check: contracted monthly fee vs the amount of the last paid subscription (the live PayFast amount). When they differ, show a clear banner on ROL Account and on the admin billing overview — "Subscription amount changed: PayFast is collecting R3 770,00, contracted amount is R X" — with the staff action to schedule the plan change and the owner action to activate the new plan inside its window. A backfill pass runs this check for existing accounts so Jongensfontein is flagged immediately.

### 4. Always notify
Every recorded change sends the admin + owner email (amount before/after, effective date, what the owner must do), including changes that only alter the monthly fee with no once-off delta. The change log records the notification result so failures are visible instead of silent.

## Technical notes

- `src/components/property/PaymentProvidersTab.tsx`: drop the direct `property_billing_configs` upsert; use `useBillingConfig` (scope-aware) so `apply_config_change` fires.
- `supabase/functions/subscription-billing-actions/index.ts`: replace the local `monthlyFee()` add-on maths with a shared resolver mirroring `src/lib/billingExpected.ts` (extract to `supabase/functions/_shared/`), use sellable units for the channel-manager fee, and always send the change email when `feeChanged`.
- New helper `src/lib/subscriptionDrift.ts`: compares contracted fee vs last paid `subscription_invoices.subscription_amount`; consumed by `AccountTwoPaymentCard.tsx` and `AdminOverviewTab.tsx`.
- Redeploy `subscription-billing-actions` after the change.
