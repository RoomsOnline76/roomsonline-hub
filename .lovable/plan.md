

# Transform Payments Page into Property Payout Summary + Payment Advice

## Problem

The current `/admin/payments` page shows raw transaction-level data (individual guest payments). What it should show is a **property-level payout summary**: for each property, the total collected, ROL's commission deducted, and the net amount owed to the property — plus the ability to send a payment advice/remittance note to the property owner.

The system already has the infrastructure for this — `payout_ledger` entries with `gross_amount`, `commission_amount`, `net_amount` per property, and the `bank-export-api` edge function. The payments page just doesn't use it.

## What Changes

### 1. Add "Property Payouts" tab (make it the default)

New primary tab showing a **property-grouped summary table**:

| Property | Gross Collected | Commission (%) | Fees | Net Payout | Banking | Status | Actions |
|----------|----------------|----------------|------|------------|---------|--------|---------|
| Six on N | R24,500 | R1,960 (8%) | R250 | R22,290 | Verified | Pending | Send Advice / Mark Paid |

Data source: `payout_ledger` entries grouped by `property_id`, joined with `property_billing_configs` for commission rate and `property_bank_details` for banking status.

Summary stat cards update to show:
- **Total Due to Properties** — sum of net_amount where status = eligible/pending
- **Total Commission Earned** — sum of commission_amount
- **Properties Awaiting Payout** — count of distinct properties with pending entries

### 2. "Send Payment Advice" action per property

Button on each property row that generates and emails a **payment advice/remittance note** to the property owner. The email contains:
- Period covered
- Breakdown of bookings (guest name, dates, amount)
- Commission deducted (rate + amount)
- Any additional fees (white-label, subscription, payment facilitator)
- **Net amount being paid**
- Banking reference

This uses the existing `send-booking-email` edge function pattern (or a new `send-payment-advice` template via the transactional email system).

### 3. Keep existing tabs but reorganize

- **Property Payouts** — new default tab (the summary view)
- **Transactions** — existing raw transaction list (moved to second tab)
- **Commission Payouts** — existing rep commission tab (third tab)

### 4. Edge function: `send-payment-advice`

New edge function that:
- Accepts `property_id` and `period` (month/year)
- Queries `payout_ledger` entries for that property/period
- Queries `property_billing_configs` for commission rate and fees
- Renders a branded payment advice email with line-item breakdown
- Sends to `owner_email` from properties table
- Logs to `billing_transactions` as type `payment_advice_sent`

## Technical Details

### Data query for Property Payouts tab

```typescript
// Query payout_ledger grouped by property
const { data } = await supabase
  .from('payout_ledger')
  .select(`
    property_id,
    gross_amount,
    commission_amount,
    commission_rate,
    net_amount,
    status,
    created_at,
    properties!inner(name, owner_email),
    property_bank_details(is_verified)
  `)
  .in('status', ['pending', 'eligible', 'exported'])
  .order('created_at', { ascending: false });

// Group by property_id client-side for summary rows
```

### Payment advice email template

Professional remittance-style email showing:
- Header with ROL branding
- Property name and period
- Table of bookings with amounts
- Commission line item
- Fee line items (if applicable)
- Net payout amount (bold, highlighted)
- Banking reference number
- Footer with contact details

## Files

| Action | File |
|--------|------|
| Modify | `src/pages/AdminPayments.tsx` — add Property Payouts tab as default, reorganize existing tabs |
| Create | `src/components/payments/PropertyPayoutTable.tsx` — grouped property payout summary component |
| Create | `src/components/payments/PaymentAdviceDialog.tsx` — preview + send payment advice modal |
| Create | `src/hooks/usePropertyPayouts.ts` — hook to query and group payout_ledger by property |
| Create | `supabase/functions/send-payment-advice/index.ts` — edge function to generate and email payment advice |
| Deploy | `send-payment-advice` edge function |

No database changes needed — `payout_ledger`, `property_billing_configs`, `property_bank_details`, and `billing_transactions` tables already exist.

