# Reservation-only mode (no online payment)

Properties can be set to **Reservation only**: the guest completes a reservation with no payment step, and the property collects payment manually (EFT) and marks it paid in ROL'OS.

## Behaviour

**Setting (Admin/dev/fearless_leader only)**
- New "Payment handling" choice in the property payment provider section: *ROL gateway* / *Own gateway (BYO)* / *Reservation only — no online payment*.
- Portfolio-wide inheritance, same as payment providers: setting it on one property in a portfolio applies to all members unless a property has an explicit override.
- Owners see the mode as read-only status in ROL'OS.

**Guest checkout**
- Payment method selector and pay button are replaced by a "Confirm reservation" step.
- Copy makes it explicit: reservation is subject to confirmation by the property, payable by bank transfer.
- Reservation is created with `status: pending`, `payment_status: unpaid_reservation`, and a hold expiry.

**Hold lifecycle (ROL'OS default, mirrors channel leads)**
- 3-day hold: dates blocked in availability.
- After 3 days unpaid: hold released, dates sellable again, reservation stays visible (muted) and convertible.
- Hold lapsed **and** arrival within 14 days: reservation cancelled, cancellation email to guest and property.

**ROL'OS side**
- Reservation card gets "Mark as paid" (deposit received / paid in full); confirming or checking in also marks it paid.
- Marking paid clears the hold and confirms the reservation.
- Cancellations and refunds behave exactly as today (existing cancellation policy engine, forfeiture tiers, refund flow).

**Reservation email + pro forma invoice**
- Distinct reservation email template (separate from the paid-booking confirmation), used only for reservation-only properties.
- Includes the property's banking details (bank, branch code, account holder, account number, account type, SWIFT when present) as a clean, boxed "How to pay" block — unobtrusive but noticeable — plus the reference to use (the standardised `ROL-…` booking reference).
- Deposit: when the property's deposit policy applies, the pro forma shows the deposit amount and due date as the amount payable now, with the balance and due date underneath; otherwise the full stay total is shown as payable.
- Cancellation policy and relevant T&Cs are rendered in the email and on the pro forma.
- The same banking / payable block is added to the pro forma PDF/HTML document so the attached and downloaded versions match the email.

## Technical notes

- Migration: `properties.payment_mode` (`rol` | `byo` | `reservation_only`, default derived from current config) and matching column on `portfolio_payment_configs` for inheritance; `bookings.hold_expires_at` / `hold_released_at` reused for reservation holds (already exist for channel leads).
- Inheritance handled in the existing `trg_portfolio_payment_config_sync` trigger so all portfolio members stay in step.
- `useActivePaymentGateways` gains a `paymentMode` result; `InlineCheckoutPanel`, `InlineCheckout`, `Booking.tsx` and `JourneyCheckout` branch on it to skip gateway initiation.
- Banking values read from `properties.amenities.banking` (already captured in the Company Information card); verified `property_bank_details` used when present.
- Hold expiry/release/cancel handled by extending the existing `ru-lead-lifecycle` worker (or a sibling reservation-hold worker on the same 30-minute cron) so both channel leads and direct reservations follow one policy.
- Email work in `send-booking-email` (new reservation trigger + banking/T&C blocks) and `pms-financial` pro forma renderer; both redeployed.
