# Booking not closing inventory at the channel manager

## What the records show

Booking `ROL-TID-0005` (Tidal Pools, LEERVIS, 16–30 Oct 2026, confirmed + paid) did produce the expected local trail:

- 14 stop-sell days were written for LEERVIS (16–29 Oct) as manual calendar blocks.
- An availability + pricing refresh for the property ran 40 seconds after the booking and was logged as successful.
- That run's own read-back reported LEERVIS unit 5655617 as 365/365 days matching, with zero mismatches.

So on our side the block exists and the push says the channel accepted it, yet the unit is still sellable at the channel. That contradiction is not explained by the logs, so the cause is **unconfirmed** — the first step is to prove what the channel actually holds for those dates, not to guess.

## Step 1 — Authoritative read-back (diagnosis)

Add a staff-only "Verify channel calendar" action for a unit + date range that pulls the channel's calendar using the property's sub-account keys (master keys return "Property does not exist", which is why an ad-hoc check is currently impossible) and shows a per-day table: units, blocked flag, reservations, min stay.

Run it for LEERVIS, 14–31 Oct 2026. Outcome decides the fix:

- Channel returns 0 units → our push is right and the availability the user sees is a different listing (duplicate unit, other sub-account, or a channel-side display of the parent listing). Fix becomes listing hygiene.
- Channel returns free units → the accepted push is not sticking. Fix becomes the push contract (below).

## Step 2 — Make the block provable per booking

Regardless of outcome, a booking should carry evidence that it closed inventory:

- Record, per booking, which unit/date range was blocked, when the channel refresh ran, and the read-back result for exactly those dates (not the whole 365-day window, where 14 bad days can hide inside a 365/365 summary).
- Surface it on the booking in ROL'OS with a "Re-push block" action when the read-back for the booked dates is not closed.
- Verify the booked date range specifically after every booking-triggered refresh, and mark the refresh failed if those days come back sellable.

## Step 3 — Close the gaps found in the push path

- Booking-triggered refreshes are debounced 5 minutes per property and simply dropped when a recent refresh exists; a booking must never be dropped — schedule a follow-up push instead of skipping.
- Availability sent to the channel is derived only from seasons plus manual calendar rows. Bookings block inventory indirectly, so any failure to write those manual rows silently leaves the unit open. Derive the closed days from confirmed/paid bookings as well, so the pushed payload is correct even when the manual rows are missing.
- Manual rows whose room type is blank currently apply to every unit of a property, which can both over- and under-block multi-unit properties; scope them explicitly.

## Step 4 — Backfill

Re-push availability for Tidal Pools' four live units and confirm 16–29 Oct 2026 reads back closed for LEERVIS, then run the same check across active channel-connected properties with confirmed future bookings and re-push any unit whose booked dates are still sellable.

## Technical notes

- Read-back and pushes must use the owning sub-user credentials (`ru_api_credentials` → `ru_owner_accounts`), as the existing shared resolver does.
- Verification lives next to `verifyAvailability` in `push-property-to-ru`; add a booked-range assertion and store it in the sync run details plus a per-booking sync record.
- Booking-side hooks are in `push-booking` (block rows) and the shared ARI delta helper (debounce).
- No changes to locked adapter regions are proposed; the availability payload builder itself stays as is.
