# /admin/payments — relevance review and stat-strip fix

## Verdict: keep the page, delete the stat strip

The page's two tabs are load-bearing and have no equivalent anywhere else:

- **Property Payouts** — `PayoutStatementRun`: the only place immutable owner payout statements (`ROL-PAY-...`) are generated, viewed and downloaded.
- **Property Invoices** — `PropertyInvoiceRun`: the only place ROL receivables (BYO commission + platform fees) are raised and settled.

So the page should not be discarded. What is wrong is only the five-card headline strip above the tabs.

## Why the numbers are wrong (confirmed)

- The strip mixes two different periods. `payoutStats` (Due to Properties, Recoverable BYO, Commission Earned) is scoped to `this_month`, while `txStats` (Total Collected, Pending) is queried with **no date filter at all** — it is all-time. Cards sit side by side as if comparable.
- The period selector is dead code: `payoutPeriod` state exists in `AdminPayments.tsx` but is never rendered, so the payout period is permanently locked to "this month" with no way to see or change it.
- The two halves also count different money. `Total Collected` counts only settled `payment_transactions` (the database currently holds exactly one paid transaction, R700 in Aug 2026 — matching the screenshot), while `Due to Properties` (R5,586) is derived largely from bookings marked paid at booking level with no gateway transaction. Neither number is wrong on its own; together they read as a broken reconciliation.
- These are live-view estimates, whereas the persisted statements in the tab below are the authoritative figures — so the strip can contradict the documents directly beneath it.

## What to change

1. Remove the five-card strip and the `txStats` state, `loadPayments()` query, `usePropertyPayouts` call, dead `payoutPeriod`/`payoutRange` code, and the local `StatCard` from `AdminPayments.tsx`. The page becomes header + the two tabs, each of which already surfaces its own accurate period totals.
2. Update the page header subtitle to say plainly that this is the statement and invoice workspace, and that platform-wide money metrics live in ROL Pulse.
3. In **ROL Pulse → Revenue**, add a small consistent money row so nothing is lost by removing the strip: Total Collected (settled gateway value), Commission Earned, Recoverable (BYO), and Due to Properties — all four computed over the **same** period selector already present on that tab, and all four labelled as live estimates.

## Technical notes

- Files touched: `src/pages/AdminPayments.tsx` (trim), `src/components/dashboard/ROLRevenuePulse.tsx` (new metrics row), reusing `usePropertyPayouts` with the Pulse period range so every card shares one window.
- No schema changes, no edge function changes, no change to how statements or invoices are generated.
- `usePropertyPayouts` stays as-is; it is still used by the payout statement run and now by Pulse.
