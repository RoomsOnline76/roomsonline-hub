# ROL Pulse → Revenue: property billing (expected / paid / subscribed)

## Where the billing revenue lives today

Nothing was lost, but it is not on the Revenue tab and it is not per property:

- **ROL Pulse → Revenue** ends with a "Billing Summary" card. That card is booking-commission only (commission, fees, transaction count, last owner payout invoice). It has no subscription or once-off billing.
- **ROL Pulse → Accounting** has "Revenue streams · trailing 3 months", which does split Setup fees / Monthly subscriptions / Booking commission, less pass-through, plus net margin. That is the closest existing surface, but it is a single global 3-month total with no per-property detail and no expected-vs-paid view.
- **Forecast** expenditure and client cost live elsewhere (Channel Monitor, Estimated Client Cost on the property/portfolio billing tab). Expected SaaS *income* per property has no home yet.

Current data state: `subscription_invoices` is empty (no invoices raised yet), 97 property billing configs and 1 portfolio config are all in `pending`/`cancelled` subscription status. So any new section must read correctly with zero invoices and show expected/contracted amounts from billing configs, not only from invoices.

One confirmed bug found while mapping this: the revenue hook classifies setup revenue by `invoice_kind === "setup"`, but once-off setup invoices are actually created with kind `once_off`. Setup fee income would therefore read R0 and be double-counted as subscription income.

## What will be built

A new **"Property billing & subscriptions"** section on the Revenue tab of ROL Pulse, placed directly above the existing Billing Summary card, honouring the selected date range.

### 1. Summary strip (period-aware)

- **Expected** — contracted monthly recurring for all live billing entities in the period (tier-resolved PMS subscription + Channel Manager + white-label licence + add-ons), plus once-off setup fees falling due in the period.
- **Invoiced** — total raised on `subscription_invoices` in the period, split monthly vs once-off.
- **Paid** — total settled in the period, split monthly vs once-off.
- **Outstanding** — invoiced and not paid, with an overdue subset.
- **Subscribed** — count of entities with an active subscription vs pending vs cancelled, plus MRR of the active set.

### 2. Per-property / per-portfolio table

One row per billing entity (portfolio rows roll up their properties, matching how billing is actually configured):

| Column | Meaning |
| --- | --- |
| Property / Portfolio | Name, with scope badge |
| Status | Active / Pending / Trial (in free period) / Past due / Cancelled / Reservation only |
| Monthly expected | Tier-resolved recurring total |
| Setup expected | Once-off contracted setup total |
| Invoiced (period) | Monthly + once-off raised |
| Paid (period) | Monthly + once-off settled |
| Balance | Outstanding, styled red when overdue |
| First billing date | Engagement date + free period |

Sortable by balance and monthly expected, searchable by name, filterable by status. Clicking a row deep-links to that entity's ROL Account.

### 3. Once-off billing revenue callout

A small card showing once-off income in the period (setup fees, activation charges) invoiced vs paid vs still expected, so upfront revenue is not blended into MRR.

### 4. Fix the stream classification

Correct the setup/once-off invoice kind handling so the Accounting tab's "Setup fees (upfront)" and "Monthly subscriptions" rows report accurate values, and keep the new Revenue section using the same classification.

Access stays restricted to admin / dev / fearless leader, as with the rest of ROL Pulse.

## Technical notes

- New hook `src/hooks/usePropertyBillingRevenue.ts`: reads `property_billing_configs`, `portfolio_billing_configs`, `subscription_charge_items` and `subscription_invoices` for the selected range; resolves monthly expected via the existing `src/lib/billingTierResolver.ts` and first-billing dates via `src/lib/billingSchedule.ts`, so the numbers match the Estimated Client Cost card.
- New components under `src/components/dashboard/`: `PropertyBillingRevenueSection.tsx` (summary strip + once-off card) and `PropertyBillingTable.tsx`.
- Mount both in `ROLRevenuePulse.tsx` inside the `revenue` tab, above `BillingPulseCard`, passing `dateRange`.
- Treat `invoice_kind` `once_off` (and legacy `setup`, if any appears) as once-off, `activation`/`renewal` as monthly; centralise that mapping in a small helper so the hook and `useRolActualRevenue.ts` agree.
- Paid amounts key off `paid_at` within the range and settled statuses only; invoiced amounts key off `created_at`.
- Portfolio rows aggregate member properties to avoid double counting property-level and portfolio-level configs for the same entity.
