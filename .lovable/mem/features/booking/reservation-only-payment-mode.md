---
name: Reservation-only payment mode
description: Properties can opt out of online payment (payment_mode reservation_only) — checkout, journey, guest email and pro forma carry banking details, deposit terms and cancellation policy
type: feature
---

`properties.payment_mode` = `rol` | `byo` | `reservation_only` (`src/lib/paymentMode.ts`).

Reservation-only behaviour:
- No gateway is offered at checkout (single-property `Booking.tsx`, `InlineCheckoutPanel.tsx`, and `JourneyCheckout.tsx` when ANY stay's property is reservation-only).
- Booking is written as `status: pending`, `payment_status: awaiting_eft`, `payment_method: eft`, `reservation_hold: true`, `hold_expires_at` = now + `RESERVATION_HOLD_DAYS` (3), plus `deposit_amount` / `deposit_due_date` from `resolveReservationTerms()` (`src/lib/reservationTerms.ts`; policy library first, then house-rules deposit block).
- Guest email: `send-booking-email` accepts `email_type: "reservation_only"`, forces the standard template (skips custom templates), and renders a banking/terms block (`generateReservationPaymentBlock`) with amount due now, balance, banking details (property `amenities.banking`, falling back to `property_bank_details` masked account), payment reference (`rol_reference`) and cancellation policy.
- Pro forma: `pms-financial` create-invoice path hydrates banking + reservation terms and prints a "Payment by bank transfer" block on the document.
- Payment is later marked paid manually in ROL'OS; cancellations/refunds follow the existing flow.
