# Human-friendly reference numbers

Today a guest can be shown three different things depending on the screen: the proper reference (`ROL-EMB-B-TID-00005`), a random 8-character slice of the internal record id (`FF2BA23C` — this is what the guest portal, several confirmation e-mails and journey e-mails print), or the channel's own number. The proper reference exists on every booking in the database; several front-facing surfaces simply never read it.

The fix is one compact reference, used identically inside ROL'OS and in front of guests.

## The new format

```text
Bookings / reservations   ROL-JON-1042
Journeys (multi-property) ROL-TRIP-0014
```

- `JON` — the 3-letter property code already stored on each property.
- `1042` — the running number per property (continues the existing counters, minimum 4 digits).
- Easy to read out over the phone, easy to type into a search box.

Origin and type (embed, white-label, channel, front desk / booking vs reservation) stay recorded on the record and stay visible as a small label next to the reference on staff screens — they just leave the number itself. Invoice, statement and payout numbering (`ROL-SET-…`, payout and commission statements) already follows a logical scheme and stays as-is.

## What changes

1. **One reference on every guest surface.** Guest portal, booking confirmation page, all confirmation / modification / cancellation / reminder e-mails, guest vouchers, PMS message templates and the WordPress plugin all print the ROL reference. The "first 8 characters of the internal id" fallback is removed everywhere it faces a guest or owner.
2. **Journeys get their own reference.** A multi-property journey gets `ROL-TRIP-0014`, shown on the journey confirmation page and brochure e-mail, with each stay still carrying its own booking reference underneath.
3. **Search accepts anything a guest quotes.** Staff and guest lookups match the new compact code, the previous long code, the channel reference, and partial input with or without dashes (`1042`, `jon-1042`, `ROL-JON-1042`).
4. **Backfill.** Every existing booking is renumbered into the new compact format, keeping its current running number so nothing shifts; the previous long reference is retained on the record so a code already e-mailed to a guest still resolves. Existing journeys are numbered in creation order.

## Technical notes

- DB migration: rewrite `assign_rol_booking_reference()` to mint `ROL-<PROP>-<NNNN>` (counter logic and `booking_reference_counters` unchanged, origin/kind still written to `rol_ref_origin`); add `rol_reference_legacy` to `bookings`; add `rol_reference` + counter support for `itineraries` with its own trigger; data step to backfill both tables.
- `src/lib/bookingReference.ts` and `supabase/functions/_shared/bookingReference.ts`: new formatter/parser (accept both old and new patterns), `displayBookingReference` drops the id-slice fallback, `matchesReferenceSearch` also matches `rol_reference_legacy`.
- Surfaces to update: `src/pages/GuestPortal.tsx`, `src/pages/BookingConfirmation.tsx`, `src/pages/JourneyConfirmation.tsx`, `src/pages/pms/PMSDashboard.tsx`, `src/components/pms/**`, `src/wp-admin/components/AdminApp.ts`.
- Edge functions to update: `send-booking-email` (6 fallback sites), `send-itinerary-email`, `pms-message-dispatcher`, `booking-confirmation-lookup` (accept reference as well as id key).
- Reference display stays a single helper call so no surface can drift again.
