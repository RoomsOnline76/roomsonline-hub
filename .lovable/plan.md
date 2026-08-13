# Account for the price difference when a paid booking is modified

## What happens today (verified)

- `modify-booking` recalculates `total_price` for ROL-native stays and pushes the new `ClientPrice`/`AlreadyPaid` to the Channel Manager, then overwrites `bookings.total_price`. It never compares the new total to what the guest actually paid.
- There is no paid-amount column on `bookings`. Money received is inferred:
  - ROL-collected: sum of settled `payment_transactions` rows for the booking.
  - Channel-collected (Rentals United): `payment_status = 'paid_externally'`, with the amount only buried in `modification_notes.amount_already_paid`.
- `refunds-api` (`request_refund`) falls back to `total_price` when no gateway transaction exists. Because `modify-booking` already wrote the *new, lower* total, a refund raised afterwards is capped at the shortened amount — the overpayment is invisible.
- Nothing writes an outstanding balance anywhere, and the Refund Register (`/rolos` Reports) is only ever populated by hand.

Net effect: shortening a fully paid stay silently loses the credit; extending it silently loses the amount owed.

## What gets built

### 1. A real paid-amount figure per booking

Add `amount_paid` and `amount_paid_source` to `bookings`, maintained as money actually arrives:

- ROL-collected payments (PayFast/gateway ITN success) increment it.
- Channel ingest writes it from the channel's `AlreadyPaid` (already parsed today) instead of only stashing it in notes.
- A one-off backfill sets it for existing bookings from settled `payment_transactions`, falling back to the channel `amount_already_paid`, and to `total_price` where `payment_status` is `paid`/`paid_externally`.

This is the anchor the difference is measured against, so it survives any later change to `total_price`.

### 2. Modify-booking accounts for the difference

Inside `modify-booking`, after the channel accepts and before the local write, capture `amount_paid` and the old total, then act on `new_total - amount_paid`:

- **Guest overpaid (shorter/cheaper stay)** — raise a refund in the Refund Register for the exact difference, status **pending**, `reason_category = 'date_change'`, with an auto-written note naming the old and new stay, old and new total, and the amount received. No money moves: an owner/admin must approve, and execution follows the existing gateway/manual-settlement path. Channel-collected bookings are flagged `manual_settlement` since there is no ROL gateway handle to reverse.
- **Amount outstanding (longer/dearer stay)** — write the shortfall to the booking as a balance due and queue a branded payment request to the guest with a tokenised checkout link for the difference only, using the existing gateway `initiate_payment` path. Reservation-only properties get a balance notice without a payment link.
- **No difference** — nothing is raised.

Both outcomes are recorded in the booking's modification history and returned to the caller so the dialog can state exactly what was raised.

### 3. Operator sees it before saving

The Modify dialog gains a live settlement summary under the total: amount received, new total, and the resulting **Refund due to guest** or **Outstanding from guest**, with the wording for the action that will be taken. The operator can override the amount, and can opt out of the automatic refund/payment request for that one edit (defaults on). On success the toast names the outcome ("Refund of R1 800 raised for approval").

### 4. Owner and accounts awareness

- Booking card: a settlement line showing paid / total / refund pending or balance due, with a link into the Refund Register.
- Command Centre: a **Pending refunds** card (count and value awaiting approval) next to the existing overbooking and background-work cards, deep-linked to the register.
- Refund Register: filter chip for refunds raised by a modification, showing the stay change that caused them.
- Owner account and payout views: pending refunds and outstanding balances shown as known movements so a payout is not built on money that is about to go back to a guest.

## Technical notes

- Migration: `bookings.amount_paid` (numeric, default 0), `bookings.amount_paid_source` (text), `bookings.balance_due` (numeric, default 0), plus indexes for the pending-refund and balance-due lookups; backfill runs in the same migration.
- Edge functions: `modify-booking` (difference logic, refund creation, balance write), `refunds-api` (accept an explicit `amount_paid` basis so a post-modification refund is not capped by the new total), `send-booking-email` (new `balance_request` status), plus a queue job type for the payment request so the modify call stays fast.
- Frontend: `BookingModifyDialog.tsx` (settlement summary), `BookingQuickViewSheet.tsx` (settlement line), new `PendingRefundsCard.tsx` in the Command Centre, `RefundRegisterPanel.tsx` (origin filter), `useRefundRegister.ts` extension.
- Refund creation goes through the existing `refunds-api` request path so entitlement, access checks and the approval workflow are unchanged — modification only supplies the amount and reason.
