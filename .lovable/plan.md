# Property Pulse: account for what is already on the books

## The problem, confirmed in the code and data

The chart deliberately throws away every future booking. In the daily series each future day is written as `isFuture ? 0`, so bookings, revenue and cancellations for any date after today are forced to zero, and the forecast is then a pure statistical extrapolation of the past with no knowledge of held business. The month view has the same effect, because a month that has not happened yet only ever receives the statistical forecast.

The database says this is material right now: 134 future arrivals are on the books — 30 confirmed, 88 pending, 16 cancelled — worth about R5.27m, with R5.27m already received against R5.27m due on the paid ones. All of that is currently invisible on the graphs.

The Y-o-Y line has the mirror-image flaw: last year is compared at its final, fully-materialised state, while this year's future is zero. Any forward month therefore looks catastrophic against last year even when it is pacing ahead.

## What changes

### 1. On-the-books (OTB) becomes a real series

Future periods stop being zeroed. Every future date/month carries what is actually held, split by commercial certainty so the picture is honest:

- **Confirmed / checked-in** — hard business.
- **Pending / provisional** — held but not yet firm.
- **Paid vs deposit vs unpaid** — driven off `payment_status`, `amount_paid`, `deposit_amount` and `balance_due`, so a booking with only a deposit is not presented as fully banked.

Cancellations stay excluded from OTB, as they are today for actuals.

Visually: solid bars up to today (actuals), OTB bars for future periods with the firm portion solid and the provisional portion lighter, so the eye can separate "certain" from "likely".

### 2. Forecast = OTB + expected remaining pickup

The forecast becomes a floor-plus-pickup model instead of a blind trend:

```text
forecast(period) = OTB(period) + expected_pickup(period)
```

- `OTB(period)` is what is already held (firm + a haircut on provisional business, using the historical realisation rate of pending bookings for the selected properties).
- `expected_pickup(period)` is the additional business that history says still arrives between today and that period's arrival date. It is derived from the existing booking-curve data — `created_at` versus `check_in_date` — so a month three weeks out gets a small pickup allowance while a month six months out gets a large one.
- Confidence bands widen only around the pickup component. Held business is not uncertain, so the lower bound can never fall below firm OTB. This removes today's nonsense case where the 95% band dips under business already paid for.

The forecast line stays visually distinct and continues to join the last actual point.

### 3. Y-o-Y compares OTB to OTB (same lead time)

For any future period, last year's comparison is rebuilt "as at the same point in the booking cycle": only prior-year bookings that had been created on or before the equivalent date one year ago are counted. A same-time-last-year (STLY) series, not last year's final result.

Historical periods keep comparing final actuals, which is correct. The legend labels the forward part of the prior-year line as STLY so the basis is never ambiguous.

### 4. KPI cards and CSV

- The KPI strip gains an OTB read for the selected range: rooms/nights and revenue on the books, with the paid/deposit/outstanding split, plus a pace indicator versus STLY.
- The Y-o-Y deltas on forward-looking ranges are recalculated against STLY rather than final prior-year, so the percentages on the cards and the chart agree.
- The CSV export gains `OTB Bookings`, `OTB Revenue`, `OTB Firm Revenue`, `OTB Paid`, `OTB Deposit`, `Expected Pickup` and `STLY` columns alongside the existing forecast columns.

## Technical notes

- The pace/pickup and OTB maths move out of `src/pages/Dashboard.tsx` into a dedicated, unit-tested module (`src/lib/pulseOnTheBooks.ts`) — the page is already large and this logic needs tests around the lead-time bucketing.
- The prior-year query already fetches whole bookings; STLY only needs `created_at` filtering client-side, so no extra round trip.
- PMS reservations are normalised into the same shape as native bookings, as they are today; they have no payment split, so they count as firm-unpaid OTB.
- Both aggregation modes (daily and monthly) share one code path for OTB, pickup and STLY so the two views can't drift.
- No schema change and no backend change is required.
