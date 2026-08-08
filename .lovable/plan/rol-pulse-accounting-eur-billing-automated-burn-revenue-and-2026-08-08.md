# ROL Pulse Accounting: EUR billing + automated burn, revenue and runway

## Goal

Three changes to Revenue Pulse → Accounting:

1. Bills can be loaded in Euro (alongside Rand and Dollar).
2. Monthly burn is derived from the recurring bills that have been loaded — no longer a number typed into "Add Metric". A recurring bill counts **once**, no matter how many invoices exist for it.
3. Runway and forecast compare that derived burn against **actual ROL revenue** (commission earned + subscription fees collected), not a manually entered revenue figure.

## What changes for the user

**Adding a bill**
- New "Currency" selector: ZAR / USD / EUR. You enter the amount in the bill's own currency; the Rand equivalent is shown live and stored for reporting, using the exchange rates on the latest financial snapshot.
- Billing type keeps its meaning: Monthly / Quarterly / Annual are recurring; Once-off is not.
- Invoice list gains a EUR column and shows which currency the bill was issued in.

**Burn rate (automatic)**
- Every recurring bill is normalised to a monthly Rand cost: monthly as-is, quarterly ÷ 3, annual ÷ 12.
- Duplicate invoices for the same recurring commitment are collapsed to one line, matched on vendor + description + billing type (case-insensitive), keeping the most recent invoice as the current price. Loading twelve Supabase invoices therefore still adds one monthly cost.
- Once-off bills are excluded from burn but still count in "Period Spend" and "Unpaid".
- A new "Recurring Commitments" panel lists each deduplicated commitment, its cadence, its monthly Rand equivalent and how many invoices back it — so the burn figure is auditable.

**Revenue (automatic)**
- Actual ROL revenue is read from commission on confirmed/paid bookings plus collected subscription/PMS invoices, expressed as a trailing 3-month monthly average (and current month shown alongside).

**Runway**
- Net burn = derived monthly burn − actual monthly revenue.
- Runway = Rand cash balance ÷ net burn. When revenue covers recurring costs, the card reads "Cash-flow positive" instead of a month count.
- "Add Metric" now only asks for cash balance and exchange rates (USD/ZAR, EUR/ZAR). Burn and revenue appear as read-only derived values on the form and are saved with the snapshot so the runway chart keeps history.

## Technical detail

**Migration**
- `invoices`: add `cost_eur numeric(12,2)`, `source_currency text default 'ZAR'`.
- `financial_metrics`: add `eur_rate numeric(12,4)`, `monthly_burn_zar`, `monthly_revenue_zar`, `burn_source text default 'recurring_invoices'`.
- Rewrite `calculate_runway()` trigger to work in ZAR: prefer the new `*_zar` columns, fall back to USD × `exchange_rate`, subtract revenue from burn, and return a sentinel for cash-flow positive.

**New files**
- `src/lib/burnRate.ts` — pure helpers: `toZar(invoice, rates)`, `monthlyEquivalent(amount, billingType)`, `recurringKey(invoice)`, `deriveRecurringCommitments(invoices, rates)`, `deriveMonthlyBurnZar(...)`, `computeRunwayMonths(cashZar, burnZar, revenueZar)`.
- `src/lib/burnRate.test.ts` — unit tests for cadence normalisation, duplicate collapsing, latest-price wins, EUR/USD conversion, once-off exclusion, cash-flow-positive runway.
- `src/hooks/useRolActualRevenue.ts` — queries booking commission and collected subscription invoices; returns current-month and trailing-3-month average in ZAR.
- `src/components/insights/RecurringCommitmentsPanel.tsx` — auditable list of derived commitments.

**Edited files**
- `AddInvoiceModal.tsx` — currency selector, single amount input, live ZAR conversion, writes `cost_zar`/`cost_usd`/`cost_eur`/`source_currency`.
- `InvoiceTable.tsx` — EUR column, currency badge.
- `AccountingDashboard.tsx` — use `burnRate.ts` + revenue hook for the cards, pass derived values to the metric modal, add the commitments panel to the Runway tab.
- `FinancialMetricsCards.tsx` — burn card labelled as derived, runway card handles the cash-flow-positive state and shows net burn.
- `AddMetricModal.tsx` — drop manual burn/revenue inputs, add EUR rate, show derived burn/revenue read-only, persist ZAR columns.
- `RunwayChart.tsx` — prefer the new ZAR burn/revenue columns for history.

**Note:** the migration only runs once you switch to build mode and approve it.
