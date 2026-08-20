# Check-in does not confirm the reservation at the channel

Short answer: no. Checking a guest in never tells Rentals United anything. For ROL-2F5-0010 (reservation 147032248) that matters more than usual, because the booking is still an **unconfirmed request** at the channel.

## What the records show

- ROL-2F5-0010 is `integration_type = rentalsunited_lead`, listing 5842275, reservation 147032248, stay 2026-08-20 to 2026-08-31, local status `checked_in` (updated 14:36 today).
- The outbound sync treats any `rentalsunited_lead` as `unconfirmed_request` and skips the reservation push — an RU request can only be accepted or rejected, not modified.
- The booking trail for this stay holds only half-hourly inbound reconciliation pulls (still classified `request`) and outbound rows with action `notes` / outcome `skipped`. There is no `confirmed` or `status` outbound row at all.
- Two causes stack up:
  1. The check-in path (`check_in` in the PMS API) writes the status, fires the guest webhook, and stops — it never calls the channel sync.
  2. The database trigger would classify the status change as `status`, but its background job dedupe key is per booking, so with a `notes` job already parked the new change is silently dropped (`ON CONFLICT DO NOTHING`). The 14:36 job still carries `change = notes`.

## What to build

1. **Check-in confirms the request at the channel.** When a booking that is still a channel request is checked in (or marked confirmed/in-house), run the existing confirm path (`confirmRuRequest`) so the request becomes a confirmed reservation, then flip `integration_type` to `rentalsunited` and record a `confirmed` outbound event with the outcome. Rate-limit deferral stays a deferral, not a failure.
2. **Route check-in/check-out through the single outbound entry point.** The PMS API check-in and check-out actions call `channel-booking-sync` with `change: 'confirmed'` / `'status'` so the trail shows the action even when the channel holds nothing (skipped with a reason).
3. **Stop losing changes to the dedupe key.** Include the change kind in the background job dedupe key (and keep the latest payload rather than dropping it), so a status change queued behind a notes change is not discarded.
4. **Surface it in the booking drawer.** A stay that is still a request shows "Not yet confirmed at the channel" with a Confirm action, so an operator can see that check-in alone did not settle it.

## Technical notes

- Files: `supabase/functions/roomsonline-pms-api/index.ts` (check_in / check_out), `supabase/functions/_shared/channelBookingSync.ts` (new `confirmed` branch calling `confirmRuRequest` for leads), `supabase/functions/_shared/channelBookingEvents.ts` (map `confirmed`), the `enqueue_channel_booking_sync` trigger function (dedupe key), and `BookingDetailsGrid.tsx` for the request badge/action.
- No new tables. The trigger change is a function replacement in a migration.
- After the change, re-check ROL-2F5-0010: confirm the request at the channel, then read the reservation back and expect status confirmed with the 20–31 Aug stay and current pax.
