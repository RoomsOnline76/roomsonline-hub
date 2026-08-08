# Owner Financials — "My ROL Account"

A single owner-facing page where a property or portfolio owner sees everything financial between them and ROL: what they owe, what they have paid, what ROL owes them, and every document they may need to download. Plus an API action so an owner's own systems can read their outstanding balance.

## Where it lives

New page under the **Insights** menu section (owner-visible), route `/admin/account`, titled **ROL Account**. It works for a single property or a whole portfolio via the existing property/portfolio selector pattern.

Wording is fixed across the whole page: **Due**, **Overdue**, **Paid**, **Due to you**, plus **Off — active until <date>** for a switched-off subscription.

## Page structure

**1. Balance strip (top)**
- Due now (unpaid + overdue ROL invoices and subscription invoices)
- Overdue (past due date) with age in days
- Paid this year
- Due to you (net payable on finalised payout statements not yet paid)
- One "Settle now" button that opens the existing ROL payment link for the oldest open invoice; a "Billing portal" link back to ROL's settlement page for the rest.

**2. Subscription**
- Current monthly fee, what it is made up of (platform, channel manager per unit, white-label, PriceLabs, branding add-on), currency.
- Status: Active / Pending / Past due / Cancelled / **Off — active until <period end>**.
- Engagement date, free-period countdown (60 free days), next billing date, current period.
- When admin switches billing off or the owner cancels: a clear banner "Billing switched off — your subscription stays active until <current period end>, after which access to paid features ends. No further charges."
- When admin changes the fee mid-cycle: banner "Your plan changed. A balance of <amount> is due immediately to activate the new monthly fee of <amount>." with the settle button.

**3. Payments & invoices (history)**
- Monthly subscription invoices: period, amount, status, paid date, PDF download.
- Setup / once-off fees: description, amount, status, invoice + PDF download.
- Commission invoices from ROL (own-gateway and reservation-only bookings): period, booking count, commission, VAT, total, status, PDF.
- Filter by period and status; export the visible list to CSV.

**4. Payouts & commissions due to you**
- Finalised payout statements per period: gross, ROL deductions, net payable, paid date, payment reference, statement PDF + the matching ROL tax invoice PDF.
- Period reports as paid by ROL, so an owner can reconcile a bank deposit against a statement.
- Portfolio owners see one consolidated view plus a per-property breakdown.

**5. Analytics (period selectable)**
- Revenue generated through ROL vs what ROL charged (fees + commission) per month, and the resulting cost-of-distribution %.
- Net position over time: paid to ROL vs received from ROL.
- Booking count and average booking value alongside commission, so the fee reads in context.
- Small "since engagement" all-time summary: total paid to ROL, total received, net.

**6. Statement**
- "Account statement" for the selected period: an opening balance, every charge, credit and payment in date order, and a closing balance — downloadable as PDF and CSV. Bottom of the statement carries the all-time totals.

## API

New authenticated action on the existing ROL API (API-key based, same router as the other property actions):
- `get_account_balance` — due, overdue, paid-to-date, due-to-you, currency, next billing date, subscription status and period end.
- `get_account_documents` — list of invoices, statements and their download references for a period.

Both scope strictly to the caller's own property or portfolio.

## Rules this page enforces

- Monthly fees are subscription-only; setup fees are separate, upfront, and never folded into the monthly line.
- A fee change resets the subscription: the outstanding balance is due immediately and the new monthly amount only starts once that is paid.
- Cancelled or switched-off billing stays in force until the current period end; nothing is charged after that.
- Commission invoices exclude anything already recovered through a payout deduction, so nothing is billed twice.

## Technical notes

- Reads existing tables: `subscription_invoices`, `subscription_charge_items`, `property_billing_configs` / `portfolio_billing_configs`, `rol_property_invoices` (+ lines), `property_payout_statements` (+ lines, payments), `bookings` for revenue analytics.
- **Access rules to add:** owners can currently read their subscription invoices, charge items and billing config, but `rol_property_invoices`, `rol_property_invoice_lines`, `property_payout_statements`, `property_payout_statement_lines` and `property_payout_statement_payments` are admin-only. Owner read-only access scoped to their own property/portfolio must be added for those, restricted to finalised (non-draft, non-void) records.
- **Schema to add:** subscription reset tracking on the billing config (plan-change effective date, previous fee, reset-pending flag) so a mid-cycle change can be shown and settled deterministically; and a `billing_switched_off_at` marker distinct from `cancelled_at` so an admin switch-off reads differently to an owner cancellation.
- New `src/lib/ownerAccount.ts` for balance/statement derivation (pure functions, no recomputation of stored invoice amounts), `src/lib/ownerStatementPdf.ts` for the PDF, `src/hooks/useOwnerAccount.ts` for data access, and components under `src/components/account/`.
- The subscription cron is extended to honour the reset-pending state (no renewal invoice while a plan-change balance is outstanding) and to expire access at period end after a switch-off.
- Payment links use the production domain only, never a preview host.
