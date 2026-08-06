# Channel-paid bookings, modification metrics, and cancellation analytics

## What's actually wrong

The Tidal Pools Rentals United reservation (ref 146911761, R3,760, confirmed) is in the database with `payment_status = 'paid_externally'` — that is what the RU ingest writes when the channel already collected the money.

No counter in the app knows that value. Every "paid" test looks for `'paid'` only, so the booking falls through every total:

- Bookings page counters: Paid 0, Confirmed 0, Revenue R0 (matches the screenshot)
- Admin dashboard booking/revenue counts
- ROL Pulse (`revenue-pulse-api`) — GBV, ROL revenue, channel breakdown, top properties, timeline
- Property payouts (only `paid`, `settled`, `completed`)
- Commission calculation, which refuses to run unless `payment_status = 'paid'` — so channel bookings never get a `calculated_commission` and can never appear in revenue anywhere

So it is not "skipped somewhere else" — it is skipped everywhere, by one missing status value.

### Modifications
`modify-booking` recalculates and writes `total_price`, but never recalculates `calculated_commission`. After a stay or pax change, revenue and commission totals stay on the old figure.

### Cancellations
Cancelling does remove the booking from revenue (all revenue queries exclude `status = cancelled`) — that part is correct. But:
- The cancellation count is only shown as a raw number and a percentage on Reports.
- `cancellation_reason` is free text and is never read back or analysed anywhere. There is no breakdown of why bookings are lost, no lost-value total, and no channel/property split.

## What I'll build

**1. One shared definition of "money received"**
A single source of truth listing the statuses that count as revenue: `paid`, `paid_externally`, `settled`, `completed`, plus `partially_paid` / `deposit_paid` where a partial already counts today. Applied to the Bookings page counters, Admin dashboard, ROL Pulse, property payouts, and the operator dashboard, so a channel-paid booking counts identically to a card payment.

**2. Commission on channel-paid bookings**
Allow commission calculation for externally-paid bookings, flagged as channel-settled (BYO/channel gross rather than money that landed in the ROL account), consistent with the existing settlement-split logic. This makes the RU booking appear in ROL revenue and in commission billing instead of vanishing.

**3. Modifications keep metrics honest**
After a successful modification that changes price, dates, or pax, recalculate the commission for that booking so pulse/reports/payout figures follow the new total. Keep the old and new values in the modification audit trail already written.

**4. Cancellation analytics**
- Capture a structured reason category alongside the free-text reason (guest request, date change, no payment, property/operator, channel-cancelled, no-show, other) on both the operator cancel flow and the guest self-service flow, defaulting sensibly for channel-driven cancellations so no path is left blank.
- Add a Cancellations card to Reports: count, cancellation rate, lost value, split by reason category, by channel, and by property, over the selected period.

## Technical notes

- New `src/lib/revenueStatuses.ts` exporting `REVENUE_PAYMENT_STATUSES` and an `isRevenueBooking(booking)` helper; mirrored in `supabase/functions/_shared/` for edge use.
- Update: `src/pages/Bookings.tsx` (`isPaid`), `src/pages/AdminDashboard.tsx` (`.eq('payment_status','paid')` → `.in(...)`), `src/hooks/usePropertyPayouts.ts` (`PAID_BOOKING_STATUSES`), `src/pages/Dashboard.tsx`, `supabase/functions/revenue-pulse-api/index.ts` (both the query filter and the `paidBookings` filter).
- `supabase/functions/calculate-commission/index.ts`: accept `paid_externally`, mark the resulting entry as channel-settled.
- `supabase/functions/modify-booking/index.ts`: invoke commission recalculation after the booking update succeeds; non-fatal on failure (log only, keep the 200/207 semantics).
- `cancellation_reason_category` text column on `bookings` (nullable, no backfill guesswork) with a `check` constraint on the allowed values; written by `cancel-booking`, `guest-cancel-booking`, and the RU cancel path.
- Reports: extend the existing stats memo in `src/pages/pms/PMSReports.tsx` with the cancellation aggregation and render a new card; no new data fetch needed beyond selecting the reason fields.
