## Problem (verified)

The 4 Fonteinhutte bookings in the database all have `integration_type`, `booking_channel` and `source_url` set to `NULL`, and `commission_type = 'listing'` — the column's database default. The checkout in `src/pages/Booking.tsx` never records where the booking came from, so every booking looks like a marketplace booking and the payout summary applies the 10% listing rate.

So the resolver logic is fine; the origin data is simply never captured.

## Fix 1 — Capture booking origin at checkout

New shared helper `src/lib/bookingOrigin.ts` that inspects the live page (hostname, path, query params, parent frame) and returns the origin fields to store on the booking:

| Situation | commission_type | Rate |
|---|---|---|
| Host is `book.sleepinafrica.roomsonline.co.za` (or other ROL marketplace surface: journey/itinerary/marketplace pages) | `listing` | 10% |
| White-label host, `wl=1`, embed/widget iframe, WordPress plugin, portfolio widget, property's own domain | `pms` | 2% |
| Reservation synced from an OTA/channel | `external` | 0% |

Every booking write path sets `commission_type`, `integration_type`, `booking_channel` and `source_url`:
- `src/pages/Booking.tsx` (main checkout, insert **and** the reuse-pending update)
- `src/components/booking/InlineCheckout.tsx` and `InlineCheckoutPanel.tsx` (currently hardcode `booking_channel: 'rol-website'`)
- `booking-widget-api` and `wordpress-plugin-api` edge functions — force `pms` for their own bookings
- Channel-sourced reservation handlers keep `external`

Server-side safety net in `payfast-api` / `calculate-billing`: if a booking arrives with no origin fields, derive the type from the referring URL rather than silently defaulting to `listing`.

## Fix 2 — Make the default safe

Change the `bookings.commission_type` column default from `'listing'` to `NULL`, and treat a NULL/unknown value as "derive from origin" rather than "listing". A booking is only charged the 10% listing rate when its origin positively says it came from a ROL marketplace surface.

## Fix 3 — Backfill history

Update all existing bookings that have no origin data to `commission_type = 'pms'` (marketplace bookings haven't started yet), with `booking_channel = 'legacy_direct'` so the backfill is auditable. Channel-sourced reservations remain `external`. Fonteinhutte's payout then shows R7,080 gross → R142 commission at 2%.

## Fix 4 — Payments page

- **Transactions tab:** expired rows (pending > 2h) are hidden by default; add a "Show expired" toggle above the table with a count, e.g. `Show expired (7)`.
- **Payout summary:** the commission column shows the resolved type badge (Marketplace / PMS-direct / Channel) so the applied rate is visible at a glance.

## Sales-rep commissions

`calculate-rep-commissions` and `rol_revenue_ledger` read the same `commission_type`, so rep commissions follow the corrected origin automatically once the field is populated.

## Technical notes

- No new tables. One migration (column default) plus one data update for the backfill.
- `src/lib/commissionResolver.ts` gets a small change: stop treating a stored `listing` as authoritative when no origin fields back it up.
- Edge functions to redeploy: `booking-widget-api`, `wordpress-plugin-api`, `payfast-api`, `calculate-billing`.
