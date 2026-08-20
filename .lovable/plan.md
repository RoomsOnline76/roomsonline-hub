# Modify booking: money always follows the new stay, then prove it end to end

## What is already in place (verified)

- `modify-booking` reprices the stay from Rate Plans when dates/pax change (`recalculateRolPrice`), and calls `applyBookingSettlement`, which compares the new total to what was actually received and produces either a pending refund (Refund Register) or a `balance_due` plus a tokenised guest payment request.
- The modify dialog already previews "New total" and has operator switches for "raise refund" / "request balance".
- Channel-first order holds: for channel bookings the reservation push must be accepted before the local write.

## What the data shows is still wrong

Live rows on **RU Test Clone A**:

- Every channel booking has `amount_paid = 0`, including ones marked `paid_externally` (ROL-2F5-0005, ROL-2F5-0008). So a shortened stay on a channel-paid booking computes "nothing was paid" and never raises a refund or credit.
- Cancelled bookings still carry a stale `balance_due` (ROL-2F5-0005: cancelled, `balance_due = 4270`). Cancellation does not clear or re-derive what is owed.
- ROL-2F5-0015 was repriced 2020 → 7070 by the last modification, yet `balance_due` is still 0 and `payment_status` still `pending` — the settlement outcome did not land on the booking for that path.

## Plan

### 1. Amount due always equals the new stay

- After a reprice, the booking's money fields are rewritten as one set: `total_price`, `amount_paid` (resolved), `balance_due = total − paid`, and `payment_status` re-derived (`unpaid` / `partial` / `paid` / `refund_due`). No path may write a new total without writing the matching balance.
- Channel-paid bookings (`paid_externally`, or a channel reservation with a channel-side price) resolve `amount_paid` from the pre-modification total instead of 0, so shortening a paid channel stay produces a real credit/refund instead of silence.
- Same treatment on cancel: cancelling re-derives the amount due from the cancellation policy (forfeit vs refundable) and clears any balance that is no longer owed.

### 2. Overpayment: refund scheduled or retained on account

One decision point, three outcomes, all visible:

- **Refund scheduled** — pending entry in the Refund Register awaiting approval (existing behaviour, kept).
- **Retained on account** — the difference is posted to the booking folio as guest credit and shown as "credit on account" on the card and invoice, applied automatically against any future balance on the same stay.
- **Guest chooses** — the existing credit-or-refund token page, defaulting to retained-on-account if the guest does nothing before arrival.

The modify dialog shows the arithmetic before saving: current total, new total, received, and the resulting line — "Guest owes R x" or "Overpaid R x → refund / retain on account".

### 3. Billing artefacts follow the change

- Underpaid → balance request email with the pay link, and the guest invoice reissued at the new total.
- Overpaid → refund advice or credit note, depending on the chosen outcome.
- Folio and charges are re-derived for the new night count so the invoice, folio and booking total agree.

### 4. Full scenario simulation on RU Test Clone A

A scripted run through every booking action, executed against the real functions, with the money checked after each step. Scenarios:

1. Create direct booking (unpaid) → extend → shorten → cancel.
2. Create booking, take full payment → shorten (expect refund scheduled) → repeat with retained-on-account.
3. Paid booking → extend (expect balance due + pay link) → pay balance → verify zero balance.
4. Pax-only change (no date change) → verify reprice, channel push and invoice.
5. Move to another unit (same and different rate) → verify price and channel move.
6. Channel-sourced confirmed reservation → extend → verify the channel accepted before any local write.
7. Channel-held request → verify it is refused with the accept-first message, and that accept-then-modify works.
8. Cancel a channel reservation (property vs guest cancel type) → verify balance/refund and released nights.
9. No-show and mark-paid paths.
10. Deposit-only booking → balance settlement at the new total.

Rate limits are respected: the runner paces channel calls (same-method cooldown, sequential per property, backoff on the deferred code) and treats a deferred response as "retry", never as a failure. Any step that only defers is retried until it lands so results are not false negatives.

Output: a results table per scenario (expected vs actual total, paid, balance, refund/credit, channel push state, emails queued), written to `docs/verification/booking-lifecycle-simulation-2026-08-20.md`, with fixes applied for anything that fails and the affected scenarios re-run.

## Technical notes

- `supabase/functions/_shared/bookingSettlement.ts` — channel-paid resolution, credit-on-account outcome, derived payment status.
- `supabase/functions/modify-booking/index.ts`, `supabase/functions/cancel-booking/index.ts` — single money-write block; cancel re-derives amount due.
- `src/components/pms/BookingModifyDialog.tsx` / `BookingCancelDialog.tsx` — settlement preview and refund/retain choice.
- Folio credit posts through the existing `rolos_folio_transactions` / refunds API; no new payment rails.
- Simulation driven by `supabase--curl_edge_functions` against the deployed functions with paced channel calls; adapter-lock regions untouched.
