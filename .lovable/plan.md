## Goal

The Payments page currently treats every paid booking the same: gross − commission − fees = net payout. That is wrong for BYO (bring-your-own gateway) properties, where the guest's money went straight into the owner's merchant account. For those bookings we owe nothing — we must **invoice the owner** for our commission. For bookings we processed, we should also recover the gateway (PayFast) cost as the "ROL as payment provider" fee.

## What already exists (verified)

- `payment_transactions.credential_source` is written by `payfast-api` as `'byo'` or `'rol'` on every transaction, so settlement route is known per transaction (older rows are null → treat as ROL).
- `portfolio_payment_configs` / property-level `allow_custom_payment_provider` tell us whether a property is BYO even when no transaction row exists (booking-recorded / manual payments).
- Billing configs already carry `payment_facilitator_enabled` and `transaction_fee_percentage`, with `default_transaction_fee` in `billing_global_defaults` — currently applied to *all* gross whenever the flag is on.

## Changes

### 1. Settlement split in `src/hooks/usePropertyPayouts.ts`
Per booking, resolve a `settlement: 'rol' | 'byo'`:
- gateway rows → `credential_source === 'byo' ? 'byo' : 'rol'`
- booking-recorded rows (no transaction) → BYO if the property/portfolio has a custom payment provider configured, else ROL.

Aggregate per property into new fields:
- `rol_gross`, `byo_gross`
- `rol_commission`, `byo_commission`
- `pf_fee` — gateway/payment-facilitator recovery, now charged **only on `rol_gross`**, using the existing cascade (property/portfolio `transaction_fee_percentage` → global `default_transaction_fee`), and only when payment facilitation is enabled.
- `net_payout` = `rol_gross − rol_commission − pf_fee − monthly fees` (never below 0; overflow rolls into invoiced)
- `invoiced_amount` = `byo_commission` + any monthly fees not absorbed by the payout
- `settlement_mode`: `'payout' | 'invoice' | 'mixed'`

Same split applied in `fetchBookingDetails` so the drill-down shows a per-booking "Settled by ROL / Owner (BYO)" tag.

### 2. Payout table (`PropertyPayoutTable.tsx`)
- Add a **Settled by** column/badge (ROL gateway · BYO · Mixed).
- Show both `Net Payout` and `Invoiced to owner` columns; a pure-BYO property shows R0 payout and a commission invoice amount.
- Action button label switches between "Send payment advice" and "Send commission invoice" (mixed shows a combined advice).
- Summary tiles in `AdminPayments.tsx` gain "Due to properties" vs "Recoverable from properties (BYO)".

### 3. Advice / invoice email (`supabase/functions/send-payment-advice/index.ts`)
Extend the schema with `rol_gross`, `byo_gross`, `byo_commission`, `pf_fee`, `settlement_mode`, then render three document shapes:
- **Payout advice** (ROL-settled): gross collected → commission → ROL payment-provider fee (`x%` of processed value) → monthly fees → net payable to the owner's bank account.
- **Commission invoice** (BYO): "Funds for these bookings were settled directly to your own merchant account" → booking value → commission due → total **payable to RoomsOnline** with our banking/reference line, no net payout block.
- **Mixed**: both sections plus a reconciliation line (payout offset against commission due, showing the resulting single net figure either way).

`billing_transactions` logging records `type` as `payment_advice_sent` or `commission_invoice_sent`, with the split amounts in metadata.

### 4. `PaymentAdviceDialog.tsx`
Mirror the same three shapes in the preview, and pass the new fields through to the function.

## Technical notes

- No schema changes required — everything is derivable from `payment_transactions.credential_source` plus existing billing/payment config tables.
- Commission resolution itself is untouched: the same `commissionResolver` cascade decides the rate; only *who pays it and how* changes.
- The PayFast recovery fee is presented as a percentage of processed value (existing `transaction_fee_percentage`), not a per-transaction rand amount, so no new config field is needed. If you'd rather recover the actual PayFast cost (e.g. 3.5% + R2), say so and I'll add a fixed-per-transaction component to the billing defaults.
