---
name: Never republish channel-owned nights as sold
description: Nights held by a channel-sourced reservation (request or confirmed) must not be pushed back as 0 units, or the channel refuses to modify/extend its own reservation
type: constraint
---
`loadBookingBlocks` in `push-property-to-ru` excludes bookings where
`booking_channel = 'rentals_united'` (or `integration_type` starts with `rentalsunited`) **and** an
`external_reservation_id` exists. Those nights are already decremented on the channel's own ledger.

**Why:** republishing them as `<U>0</U>` made the listing read fully booked, so the channel refused
to modify or extend its OWN reservation with "not available for the given dates / could cause a
double booking" (reservation 147110428, extension to 2026-09-15 on Leopard 5973280). The refusal
also means no live notification and no ROL'OS change — the modification never happened at all.

**How to apply:**
- Only publish blocks the channel cannot know about: direct, operator/manual, imported, live cart holds.
- Same principle as reservation write holds — do not double-close a night the channel owns.
- A channel modification that is refused produces no LNM; check `ru_api_log` for the refusal before
  suspecting the notification pipeline.
