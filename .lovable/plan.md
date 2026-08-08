# Property Payout Statements — enterprise rebuild

Replace the current live-calculated "Property Payout Summary" table with a proper statement run: consolidated per portfolio (or per property), transaction-level detail, deductions recovered via a matching ROL invoice, and a bank payment reference the property will see on their statement.

## Why the current tab falls short

Today the payout tab recalculates everything on the fly per property from settled transactions. There is no persisted statement, no portfolio consolidation, no transaction listing, no reference number and no invoice for the deductions. The ledger/bank-export tables exist but hold no data yet, and `owner_invoices` is unused.

## The accounting model

Each statement is a self-balancing document for one settlement group and one period:

```text
STATEMENT  ROL-STMT-<GROUP>-<YYYYMM>-<NN>
  Section A  Bookings settled through ROL (per transaction)
             gross  -  commission  -  transaction fee   = amount held for property
  Section B  Recoveries (money never held by ROL)
             OTA / channel commission, BYO-gateway commission,
             subscription + white-label + PriceLabs + per-unit charges, adjustments
  Section C  ROL TAX INVOICE  ROL-INV-<GROUP>-<YYYYMM>-<NN>
             equals A-commissions + A-fees + all of B (VAT shown if enabled)
             marked "Settled by deduction — paid in full"
  Section D  NET PAYABLE  =  A held  -  invoice total
             Bank: <beneficiary> · <masked account> · Reference: ROL-PAY-<GROUP>-<YYYYMM>-<NN>
```

Rules:
- Statements are **immutable once finalised** — amounts are snapshotted, later booking changes land on the next period as an adjustment line, never by editing a finalised statement.
- Each booking transaction can belong to **exactly one** statement (`statement_line` unique on transaction), so nothing is ever paid twice.
- If Section D goes negative, the shortfall carries forward as an opening balance on the next statement instead of a negative payment.
- Every line carries the standardised `rol_reference` so the property can reconcile against their own records.

## Grouping and payment

Consolidation is **configurable per portfolio** (`payout_mode` on `property_portfolios`):
- `consolidated` — one statement, one bank payment to the portfolio's banking details, per-property breakdown inside.
- `split` — one consolidated statement for the owner, but a separate payment line and reference per property (each paid to its own account).

Properties with no portfolio always produce their own statement.

## VAT

VAT is driven by a toggle in `/admin/billing defaults` (enabled flag, rate, VAT registration number, company details). When off, the ROL invoice shows a plain total; when on, subtotal / VAT / total plus the VAT number are rendered on the invoice and the invoice section of the statement.

## Page structure (`/admin/payments`)

Tabs become: **Payout Statements** · **Commission Payouts** (reps). The Transactions tab is removed.

Payout Statements tab:
1. **Period + run bar** — period selector, "Generate statements for period" (preview of what would be included), totals strip: net payable, ROL charges invoiced, recoveries, statements needing banking.
2. **Statement list** — group name, period, bookings, gross, commission + fees, recoveries, net payable, status (`draft → finalised → paid`), banking-verified badge, reference.
3. **Statement detail drawer** — Sections A–D exactly as the PDF, per-property subtotals for consolidated portfolios, drill-down to each booking, and the embedded ROL invoice.
4. **Actions** — Finalise (locks + mints references), Download statement PDF, Download ROL invoice PDF, Email owner (statement + invoice), Mark paid (records payment date + bank reference), Export CSV for bank upload.

Audit coverage previously living in Transactions is folded into the run bar as an **Unassigned payments** panel: settled gateway payments in the period not attached to any statement, plus failed/expired attempts, so nothing silently drops out of the reconciliation.

## Technical notes

Database (migration, with GRANTs + RLS admin/dev/fearless_leader only):
- `property_payout_statements` — group kind/id, owner, period, payout_mode, snapshot totals (gross, rol_commission, byo_commission, ota_commission, fees, recoveries, invoice_total, vat, opening_balance, net_payable, carry_forward), status, references (`statement_reference`, `invoice_reference`, `payment_reference`), pdf paths, finalised/paid timestamps.
- `property_payout_statement_lines` — statement_id, property_id, line_kind (`booking` | `recovery` | `charge` | `adjustment` | `opening_balance`), booking_id, payment_transaction_id (unique where not null), rol_reference, guest, stay dates, gross, commission_rate, commission, fee, net, source metadata.
- `property_payout_statement_payments` — one row per bank payment (supports the `split` mode), with beneficiary snapshot, amount, reference, status.
- `property_portfolios.payout_mode`; billing-defaults VAT columns on `billing_global_defaults`.
- Sequence functions mirroring `next_rol_booking_reference()` to mint statement/invoice/payment references per group per period.

Code:
- `supabase/functions/generate-payout-statements` — server-side run: builds draft statements for a period from settled transactions + paid bookings + `subscription_charge_items` + `booking_revenue_attributions`, reusing `commissionResolver` logic; idempotent per group/period.
- `src/lib/payoutStatement.ts` — shared totals/balance maths (no `any`), single source of truth for statement and PDF.
- `src/lib/payoutStatementPdf.ts` + `src/lib/rolChargesInvoicePdf.ts` — jsPDF documents following the existing statement style used for cost sharing.
- `src/hooks/usePayoutStatements.ts` replaces the live-calculation path in `usePropertyPayouts` for the payout tab (the hook stays for the dashboard preview run).
- `src/components/payments/` — `PayoutStatementList.tsx`, `PayoutStatementDetail.tsx`, `PayoutRunBar.tsx`, `UnassignedPaymentsPanel.tsx`; `PaymentAdviceDialog` is retargeted to a finalised statement, and `send-payment-advice` is extended to attach both PDFs.
- Remove the Transactions tab and its loader from `AdminPayments.tsx`.

## Sequence

1. Migration (tables, references, portfolio `payout_mode`, VAT defaults).
2. Statement engine + shared maths library.
3. Generation edge function, idempotent per period.
4. UI: run bar, list, detail drawer, unassigned payments; remove Transactions tab.
5. PDFs + email, mark-paid and bank CSV export.
