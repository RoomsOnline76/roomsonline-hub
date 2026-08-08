# ROL Property Billing — commission & monthly invoices

Properties that settle guest money themselves (own payment portal) or take reservation-only bookings still owe ROL commission on confirmed bookings. Today that commission is only ever *deducted* inside a payout statement — if there is no payout, there is no document to send and no way to get paid. This adds a proper receivable invoice module on **Admin → Payments**, driven by the billing agreement, with an online Pay Now link and optional VAT.

## What the fearless leader gets

A new **Invoices** tab on Admin → Payments with three parts:

1. **Run** — pick a month, click Preview. Every active property/portfolio is evaluated and shown as a proposed invoice with its lines. Lines already recovered on a finalised payout statement are excluded and shown as "already deducted", so nothing is billed twice. Zero-value groups are hidden.
2. **Invoice list** — one row per invoice: reference, property/portfolio, period, total, status (Draft → Issued → Sent → Paid / Void / Overdue), age. Bulk actions: issue, email, download PDF, mark paid, void.
3. **Invoice detail** — editable line table while Draft (edit amount, add a manual line, waive a line, add a note), locked snapshot once issued. Buttons: Download PDF, Email to property, Copy pay link, Mark paid, Void with reason.

Headline cards: outstanding total, overdue total, invoiced this month, paid this month.

## What lands on an invoice

Pulled automatically, per property or consolidated per portfolio (following the existing payout grouping rules):

- **Commission on confirmed bookings** the property collected itself — BYO gateway and reservation-only — using the existing commission resolver cascade (property terms → portfolio → global defaults), split by commission type so the guest can see rate and gross per booking, with the ROL booking reference on each line.
- **Recurring billing-agreement charges** from the property/portfolio billing config: PMS subscription, per-unit channel manager fee, PriceLabs, white-label, branding add-on, portfolio aggregator, BYO gateway fee.
- **Pending platform charges** (setup/activation and other one-off items already queued for billing).
- **Manual adjustments / credits** added by the admin before issuing.

Anything included is marked as claimed by that invoice, so a later payout run will not recover it again, and vice versa.

## VAT

ROL's tax identity is captured once on **Admin → Billing Defaults** (legal name, address, VAT number, VAT rate, VAT enabled toggle, invoice due days, bank/remittance note). While VAT is off, documents print as **INVOICE** with no tax line. Turning it on prints **TAX INVOICE**, adds VAT on top of the line subtotal, and shows the VAT number. Each issued invoice snapshots the VAT settings that were in force, so historic documents never change retrospectively.

## Getting paid

Every issued invoice carries a unique, unguessable pay link. The emailed invoice and the PDF both point to a branded ROL payment page showing the amount due and the invoice summary, settling through ROL's existing gateway. A successful payment marks the invoice paid, stamps the reference, and records the transaction. No banking details are printed — settlement is via the link only.

## Technical notes

**Database (one migration)**
- `rol_property_invoices` — group kind/portfolio/property, period, currency, subtotal, VAT rate/amount, total, amount paid, status, `invoice_reference`, VAT identity snapshot (jsonb), due date, pay token, issued/sent/paid timestamps, void reason, pdf path, actor columns.
- `rol_property_invoice_lines` — invoice id, property id/name, line kind (`commission` | `recurring` | `charge` | `adjustment` | `credit`), booking id, `rol_reference`, guest name, stay dates, gross, rate, amount, source kind/id, waived flag.
- `rol_invoice_reference_counters` + `next_rol_invoice_reference()` mirroring the payout/commission counters: `ROL-INV-<PROP>-YYYYMM-NN`.
- New columns on `billing_global_defaults` for invoice due days and remittance/footer note (VAT columns already exist).
- RLS: admin / dev / `fearless_leader` full access; `service_role` for edge functions; no anon. Pay page reads via an edge function using the pay token, not direct table access.

**Edge functions**
- `generate-property-invoices` — `preview` / `generate` / `issue` / `void` / `mark_paid`. Reuses the grouping, commission resolution and claim-dedupe logic already proven in `generate-payout-statements`, and cross-checks `property_payout_statement_lines` so a recovery can only be claimed once.
- `send-property-invoice` — emails the invoice with PDF plus pay link, using the branded property email pipeline and footer rules.
- `property-invoice-pay` — token-scoped invoice fetch, gateway session creation, and payment confirmation write-back.

**Frontend**
- `src/lib/propertyInvoice.ts` (types, totals, VAT maths, status labels) and `src/lib/propertyInvoicePdf.ts` (jsPDF document sharing the layout language of the existing ROL charges invoice).
- `src/hooks/usePropertyInvoices.ts`, `usePropertyInvoiceDetail.ts`.
- `src/components/payments/PropertyInvoiceRun.tsx`, `PropertyInvoiceTable.tsx`, `PropertyInvoiceDetailDialog.tsx`; new Invoices tab wired into `src/pages/AdminPayments.tsx`.
- VAT & invoicing identity card added to `src/pages/AdminBillingDefaults.tsx`.
- Public pay route `src/pages/InvoicePay.tsx`.

**Guardrails**
- Draft invoices are recomputable; issued invoices are immutable snapshots — corrections go out as a credit line on the next period.
- Payout statements keep working exactly as they do today; the two systems share the claim ledger so a charge is either deducted or invoiced, never both.
