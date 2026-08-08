# Property Billing: Setup Fees, Monthly Subscription, Revenue Streams

Split property billing into three clean streams — upfront setup fees, monthly subscription, and booking commission — each invoiced, paid and reported separately.

## 1. Engagement date and free period

- Add an **Engagement date** and **Free period (days)** to each property/portfolio billing config, with a global default of 60 days in Billing Defaults (editable per property).
- Monthly subscription billing starts on `engagement date + free days`, then bills monthly on that anniversary day. Nothing is invoiced during the free period.
- Billing panel shows: engagement date, free period end, next billing date, current status.

## 2. Setup fees — invoiced on contract signing

- When a property/portfolio contract is marked signed, all pending one-off setup charges (white-label, branding add-on, PriceLabs, aggregator, plus any manual once-off item) are consolidated into a standalone **Setup invoice**.
- The setup invoice is payable immediately through the ROL payment portal (existing pay page and PayFast flow), independent of any monthly invoice.
- Setup charges are no longer bundled into the first monthly/activation invoice, so the two streams never mix.
- If new chargeable add-ons are switched on later, a further setup invoice is raised for those items only.

## 3. Monthly subscription invoices

- The daily billing job only mints monthly invoices for entities past the free period, and each invoice contains monthly lines only (tier fee, channel/unit fees, PriceLabs, white-label monthly, per-unit ROL'OS fee).
- Reminder, past-due and cancellation behaviour stays as today.

## 4. Invoice on every successful payment + download history

- On each successful payment (setup or monthly), a numbered PDF invoice is generated, stored, emailed to the property, and linked on the invoice record.
- The Invoice Download Centre (property/portfolio billing panel) lists all historical invoices — setup, monthly, paid or pending — with PDF download, and the same list is available to admins from the property billing view.
- Missing PDFs on already-paid historical invoices are generated on demand when downloaded.

## 5. Property Invoices (Admin → Payments) — commission only

- Recurring platform fees are removed from the property invoice run; that stream now lives exclusively in subscription invoices.
- Property invoices carry BYO/reservation-only booking commission plus manual adjustments, avoiding any double billing.

## 6. Commission reports — revenue-based, pass-through aware

Reps are paid on the total revenue a property generates **for ROL**, so each revenue component is classified:

| Component | Commissionable |
|---|---|
| Booking commission (ROL-settled, BYO, reservation-only) | Yes |
| Monthly subscription fee (ROL'OS / platform) | Yes |
| Payment gateway transaction fees recovered when the property uses the ROL gateway | No — pass-through |
| Channel/unit distribution fees (cost of the channel subscription, passed on) | No — pass-through |
| One-off setup fees recovering third-party activation cost | No — pass-through |
| One-off setup fees that are ROL work (white-label, branding) | Yes |

- Statements show gross revenue per property, the pass-through amount deducted, the commissionable base, and the commission — fully transparent, with a footnote explaining the exclusions.
- Classification per fee type is configurable in Billing Defaults so future fee types can be flagged as pass-through or ROL margin.

## 7. Revenue Pulse — revenue stream reporting

Add a **Revenue streams** section alongside existing analytics:

- Three headline cards for the selected period: Setup fees, Monthly subscriptions, Booking commission — each with count, gross, pass-through and net ROL margin.
- Trend chart of the three streams by month, and a per-property/portfolio table (top contributors) with the same breakdown.
- Burn/runway calculations use net ROL margin (pass-through excluded), so forecasts are not inflated by recovered third-party costs.

## Technical notes

- Migration: `engagement_date`, `free_period_days`, `billing_anchor_day` on `property_billing_configs` / `portfolio_billing_configs`; `free_period_days_default` and a fee-classification map (`fee_margin_map_json`) on `billing_global_defaults`; `subscription_invoices.invoice_kind` gains `setup`; index on `(status, paid_at)` for reporting.
- Setup invoices raised by a trigger/function on contract signature (`property_contracts` / `owner_contracts` status → signed) consolidating unbilled `subscription_charge_items`.
- `billing-subscription-cron`: gate on engagement + free period, monthly-only line items, no once-off bundling.
- `payfast-api` ITN handler: on paid subscription invoice, invoke `generate-subscription-invoice-pdf`, persist `pdf_url`, send the invoice email.
- `generate-property-invoices`: drop the `recurring` line kind.
- `calculate-rep-commissions`: revenue = booking commission + commissionable subscription/setup portions using the classification map; store gross / pass-through / commissionable on report lines; PDF paysheet shows all three.
- Revenue Pulse: new hook aggregating `subscription_invoices` (by `invoice_kind`) and commission sources; `useRolActualRevenue` switches to net margin.
