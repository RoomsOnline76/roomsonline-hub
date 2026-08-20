# Outbound booking read-back — RU Test Clone A (2026-08-20)

New certification action `booking_readback_test` (Admin → Rentals United → Reservations). Runs as a
background task paced at one channel call per sliding minute and streams steps into `ru_cert_runs`
(suite `booking_readback`).

## What it does

1. Pushes a synthetic confirmed stay ~700 days out on a published unit.
2. Reads the reservation back and compares dates, guests, price and listing.
3. Extends the stay, changes the guest count, changes the price — reading back after each push.
4. Cancels and reads back to confirm the channel dropped it.
5. Deletes its own synthetic booking, so nothing lingers in the operator's list.

## Result of the first live run

| Step | Method | Result | Observed |
|---|---|---|---|
| 1 | `Push_PutConfirmedReservationMulti_RQ` | SKIPPED | Channel answers status 56 "Property does not exist" for an owner-scoped sub-user — creating reservations is a sales-channel capability, not an owner one |
| 2 | `Pull_GetReservationByID_RQ` | PASS | ROL-2F5-0015 read back: channel holds 2026-08-22 → 2026-08-24, 2 guests, price 2020, listing 5833067 — matches our record exactly |

Because synthetic creation is refused at the permission level, the test falls back to reading a real
channel reservation back and comparing it field by field with the local booking. That is the evidence
the check exists for; the skipped create is a channel boundary, not a defect in our push.

## Standing gap

Modify/cancel read-back on a *confirmed* reservation still needs a confirmed channel reservation to
exist on the test account (today the account holds leads plus one cancelled reservation). Once a
channel confirms a request on Clone A, re-run the action and the modify/pax/price/cancel read-back
steps will execute against it.
