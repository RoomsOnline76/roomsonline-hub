# Externally paid bookings: folio reflects settlement, Record Payment locked

## What's wrong

Booking "Dawie TEST 3" (Rentals United, 18-25 Aug) is marked **paid externally**: the booking carries R11 000 total and R11 000 already paid via the channel. But its folio is completely empty — no charge lines, no payment lines — so the Charges tab reads Charges R0 / Payments R0 / Balance R0 and still offers a live **Record Payment** form. A user can post a second payment against a stay the channel already collected.

Two separate problems: the folio never gets seeded from the booking, and payment capture has no guard.

## What changes

**1. Folio opens with the truth**

When the Charges tab loads a folio that has no transactions yet, seed it from the booking:
- one accommodation charge line for the booking total
- one payment line for the amount already collected, labelled as settled through the channel (or by the property) rather than as a cash/card takings line

So the summary reads Charges R11 000 / Payments R11 000 / Balance R0. Seeding happens once and is idempotent — reopening the tab never duplicates lines, and folios that already have transactions are left untouched.

**2. Record Payment only when money is actually owed**

- Booking marked paid externally, or balance is zero or negative: the **Record Payment** button is disabled with a short note — "Settled externally via the channel — nothing to collect" — and the payment form stays closed.
- Balance still owing (e.g. part payment, or a later added extra pushes the balance up): the button behaves as it does today, and it pre-fills the amount with the outstanding balance.
- Overpayment (negative balance) shows the credit clearly instead of a collectable balance.
- **Add Charge** stays available on externally paid bookings — an on-property extra is legitimate, and once posted the balance turns positive and Record Payment unlocks by itself.

**3. Server-side guard**

The payment endpoint rejects a payment that would take a booking's folio past its charges when the booking is flagged paid externally, so the rule holds even outside this screen.

## Technical notes

- `bookings.payment_status = 'paid_externally'`, `amount_paid`, `amount_paid_source` ('channel') and `total_price` are the inputs; the folio for this booking exists (`rolos_folios`) with zero `rolos_folio_transactions`.
- Seeding and the returned settlement context (`external_settlement`, `booking_total`, `amount_paid`) go into `handleGetFolio` in `supabase/functions/roomsonline-pms-api/index.ts`; the payment guard goes into `handleProcessFolioPayment` in the same file.
- Seed lines are marked with a stable reference so the idempotency check is a lookup, not a heuristic.
- `src/components/pms/BookingFolioTab.tsx` consumes the new fields to disable the button, show the settled note, and pre-fill the outstanding amount. No changes to charge/refund logic.
