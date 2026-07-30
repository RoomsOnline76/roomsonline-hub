## What the payout summary shows today

I checked the code and the live data:

- **Period: all time.** `usePropertyPayouts()` on Admin → Payments is called with no period argument, so it aggregates every settled payment transaction ever recorded. There is no date filter and no label saying so — which is why the period is unclear.
- **Why recent payouts appear missing:** the summary is built *only* from rows in `payment_transactions` with status `paid/completed/succeeded/success`. Bookings that are marked paid but have no settled transaction row (e.g. booking `eb9f3b81…`, checked out, `payment_status = paid`, zero settled transactions) never appear. Recent gateway retries also sit as `pending` (8 pending rows on 2026-07-29) and are correctly excluded, but the guest-facing booking looks paid to staff.

## Proposed changes

1. **Add a visible period selector + label**
   - Add a period control to the Property Payout Summary card: `This month`, `Last month`, `Last 90 days`, `All time` (default: `This month`), plus a specific-month picker.
   - Show the resolved range in the card subtitle ("1 – 31 July 2026, by payment date").
   - Extend `usePropertyPayouts` to accept a `{ from, to }` range instead of only a `YYYY-MM` string, keeping the existing month behaviour.

2. **Include paid bookings that have no settled transaction row**
   - After loading settled transactions, run a second query for bookings in the period with `payment_status IN ('paid','partially_paid')` and a non-excluded status that have no settled transaction.
   - Attribute their gross from the booking's paid amount (transactions where present, else `total_price`), so manually captured / folio-settled stays are counted.
   - Tag these rows in the drill-down as `Booking-recorded` vs `Gateway-settled` so admins can see the source of each amount.

3. **Date basis clarity**
   - Aggregate on payment date (transaction `created_at`; booking `created_at` for booking-recorded rows) and state that on the card, since "payout period" is otherwise ambiguous against check-out dates.
   - Add a small "as at <timestamp>" line with the existing refresh action.

## Technical notes

Files touched: `src/hooks/usePropertyPayouts.ts` (range params, second fetch pass, source tagging), `src/pages/AdminPayments.tsx` (period control + labels), `src/components/payments/PropertyPayoutTable.tsx` (source badge in drill-down). No schema or edge-function changes required.
