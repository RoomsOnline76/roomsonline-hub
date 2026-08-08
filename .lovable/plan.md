# Fix ROL charges on the property payout statement

## What's wrong today

The payout statement's "C · ROL CHARGES INVOICE" block bills four things:

1. Commission (ROL-processed) — correct, this is money ROL holds.
2. Commission (own gateway) — **already billed separately** by the property-invoice engine (it creates `byo_commission` commission lines). Billed twice.
3. Payment processing fees — computed as a percentage of gross (property config, or a 3.5% global fallback when the property has none). On the current Jongensfontein statement this produced R254,10 on R7 260 gross even though the real PayFast fee on the only settled gateway transaction was R16,10 (PayFast returns `amount_fee` on the transaction). So the number is a synthetic estimate, not the cost we recover.
4. Subscriptions & platform charges — also already billed by the property-invoice engine and the subscription plans.

Confirmed from the live statement: `rol_gross 7260`, `rol_commission 70`, `transaction_fees 254.10`, `recurring_fees 0`, `invoice_total 324.10`.

## What the statement should contain

The payout statement becomes purely a settlement of money ROL actually holds:

- **A** Bookings settled through ROL (gross, commission, processing fee, net).
- **C** ROL charges invoice, only two lines:
  - Commission on ROL-processed bookings (commissionable revenue)
  - Payment processing fee recovered (pass-through PayFast cost, non-commissionable)
- **D** Net payable = held − commission − processing fee.

Removed from the statement entirely:

- Commission on own-gateway (BYO) bookings → stays on the separate ROL property invoice.
- Subscriptions, platform and one-off charges → stays on the property invoice / subscription plan.
- The "Recoveries & platform charges" section (B) and the balance-brought-forward / carry-forward mechanics, which only existed to chase those recoveries.

## Processing fee: use the real cost

Fee per booking, in priority order:
1. The gateway's own reported fee (`gateway_response.amount_fee`) when a settled gateway transaction exists — this is exactly what PayFast charged us.
2. Otherwise the property's configured `transaction_fee_percentage` of gross.
3. Only if neither exists, the global default percentage.

No fee at all for own-gateway bookings (we never processed the money) and none when the property isn't on payment facilitation. The fee is never used as a commission base.

## Technical notes

- `supabase/functions/generate-payout-statements/index.ts`: drop the BYO-commission recovery line, the platform-charge lines (and the query feeding them), and the opening-balance line; `invoice_total = rol_commission + txFees`; `net_payable = amount_held`; `byo_commission`/`recurring_fees`/`other_recoveries`/`opening_balance`/`carry_forward` written as 0 so existing columns stay valid. Add gateway-fee resolution as described.
- `src/components/payments/PayoutStatementDetailDialog.tsx` and `src/lib/payoutStatementPdf.ts`: remove section B and the BYO/subscription/brought-forward rows; relabel the fee row "Payment processing fee recovered (non-commissionable)"; sections re-lettered A / B (invoice) / C (net payable).
- `src/lib/rolChargesInvoicePdf.ts`: same two-line composition for the deduction tax invoice.
- Historic statements keep their stored figures; only newly generated ones use the new composition.
