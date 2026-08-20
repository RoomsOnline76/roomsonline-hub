# Fix booking edit pricing and billing (ROL-700-0002)

## What is wrong

Verified against the live record for ROL-700-0002 (Leervis, 22–27 Aug, 6 adults):

- `bookings.total_price` = 12 525, which is exactly accommodation 5 000 + Extra Guest Fee 7 500 + Tourism Levy 25. The edit flow writes the **guest total** back into `total_price`, and the next edit reads that same field back as **accommodation**. So extras get charged on top of extras every time the booking is edited.
- The room line for the stay carries `rate_charged` = 2 000 while the charge maths used 5 000 as the accommodation base (levy line reads "0.5% of R5000"). The line and the booking disagree, so which number the re-price uses depends on which path runs — pricing appears not to update, or jumps.
- Extra Guest Fee is priced as R250 x 6 guests x 5 nights = R7 500 (this is the ~R9 000 extras figure the drawer shows once the levy and deposit are added). The unit's included occupancy is 2 of 6, so only the 4 guests above base occupancy should attract the fee: R250 x 4 x 5 = R5 000. There is currently no "guests included" concept on per-person charges at all.
- The drawer's Extras figure is summed from folio transactions, mixing taxes with charges and showing whatever was last posted, so it does not track the quote shown while editing.

## What will change

1. **One meaning per field.** `total_price` stays the guest total for display, but the accommodation figure becomes explicit and authoritative: the stay's room lines plus the `charges_breakdown` snapshot. Every re-price and every quote takes accommodation from there — never from the guest total.
2. **The edit dialog edits accommodation, not the guest total.** The "Total" box will be labelled as the accommodation/room total, seeded with the accommodation figure (not 12 525), with extras and the guest total shown beneath it as read-only lines.
3. **Room line and booking always agree.** After any re-price or operator override, the single room line's `rate_charged` / `nightly_rate` are written to match the accommodation figure, and multi-room stays are apportioned across active lines.
4. **Per-person charges respect included occupancy.** Per-person and per-person-per-night charges only bill guests above the unit's base occupancy (falling back to all guests when no base occupancy is set), with an explicit "guests included" setting on the charge so an owner can override it. The breakdown text states which guests were billed.
5. **Extras panel reads the quote, not the folio.** The drawer's account summary shows the reconciled rule-based charges (taxes, fees, surcharges) with refundable deposits itemised separately, and manual folio postings listed on their own line so nothing is double-counted.
6. **Repair the existing record.** A one-off correction recomputes accommodation, charges, folio lines and totals for bookings whose `total_price` already absorbed extras, so ROL-700-0002 and any sibling show honest numbers.

## Technical notes

- `supabase/functions/_shared/propertyCharges.ts`: add `baseOccupancy` / `guestsIncluded` to `ChargeContext`; `computeAmount` subtracts included guests for `per_person*` methods; `resolveBookingChargeContext` stops falling back to `total_price - snapExtras` when a snapshot exists and returns `baseOccupancy` resolved from `rolos_room_types.base_occupancy` of the active lines.
- `supabase/functions/modify-booking/index.ts`: keep `updateData.total_price = guestTotal` but also persist accommodation in `charges_breakdown`, treat `modifications.total_price` as accommodation (rename the request field to `accommodation_total`, accepting the old name for compatibility), and always sync room-line `rate_charged` after reconcile.
- `src/components/pms/BookingModifyDialog.tsx`: seed the amount field from the accommodation snapshot, send `accommodation_total`, and show extras / guest total / deposit as derived rows.
- `src/components/pms/booking/BookingDetailsGrid.tsx`: seed line `rate_charged` from the line's own value (never `booking.total_price`), and build the account summary from `rolos_booking_charges` plus unlinked folio postings.
- Migration: add an optional `guests_included` integer to `property_charges` (default null) with grants unchanged, and a corrective data pass for bookings where `total_price` equals accommodation + extras.
