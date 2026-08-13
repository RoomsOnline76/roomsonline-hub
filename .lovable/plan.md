# Elf 22–27 Aug (DAWIE 2): why it never appeared, and live updates

Two separate problems. The booking never landed in the database at all, and even if it had, the Dashboard and Rooms pages would still have needed a manual refresh.

## 1. The request was never ingested

The notification from the channel is recorded, but it failed:

- Notification `146986812`, type `reservation_request`, 13:51 today — state `failed`, error `Reservation does not exist.`
- Its raw envelope is an unconfirmed-request notification whose stay block is **empty** (`<StayInfos />`). It carries only the guest (Dawie TEST 2) and status 4 (Request) — no property, no unit, no dates.
- So the stay must be pulled back from the channel. The pull-by-id fan-out across all sub-accounts returned "Reservation does not exist" (the channel does not serve unconfirmed requests through that method yet), and the lead-listing fallback did not match either.
- Confirmed: no booking exists at Tidal Pools for 22–27 Aug, so nothing could render on any page.

The exact reason the lead listing missed it is not yet proven (timing — the poll ran at 13:51:49, the request was stamped 13:52 — or an id mismatch between `LeadID` and `ReservationID`). Step 1 of the work is to prove it rather than guess.

### Fixes
- **Diagnose first:** replay the stored envelope for `146986812` and capture the raw channel answers for both the by-id pull and the lead listing per sub-account, so we know whether it is timing or id mismatch.
- **Deferred retry instead of a hard fail:** when the detail pull fails, keep the notification in a `retrying` state and re-attempt on a short backoff (e.g. ~30s, 2m, 10m, 30m) instead of writing it off as `failed` on the first attempt. Requests routinely become readable a minute or two after the notification.
- **Match leads on both ids:** compare the notification id against `LeadID`, `ReservationID` and `ReservationStatusID`-bearing blocks, and widen the lead window to include today plus a forward window so future stays are covered.
- **Never fail silently:** surface unresolved channel requests in the Command Centre as an alert with the guest name, timestamp, error and a Retry action, so a stuck request is visible instead of invisible.
- **One-off recovery:** once the pull path works, replay `146986812` (and the other stuck notifications currently sitting in `unmapped`/`pending`) so the Elf 22–27 Aug request appears as a pending stay.

## 2. Pages do not update live

There are currently **no realtime subscriptions anywhere in the app** — no page listens for database changes, so Dashboard, Rooms and Bookings only load data when they mount.

### Fix
- Add a small realtime hook that subscribes to inserts/updates on bookings and their room lines, scoped to the properties currently in view.
- On a change: refresh the affected grid data in place and show a discreet toast ("New channel request — Elf, 22–27 Aug") with a click-through to the stay.
- Apply it to the Dashboard multicalendar, the Rooms grid, and the Command Centre alert counters, so a channel request arriving now paints without a refresh.

## Technical notes

- Ingest: `supabase/functions/_shared/ruReservationIngest.ts` (`fetchRuReservationById`, `attemptListLookup`), `ru-reservation-handler`, `cron-pull-ru-reservations`.
- Notification state lives on `ru_notifications` (`resolution_state`, `error_message`, `last_attempt_at`); add a retry counter and next-attempt timestamp.
- Realtime: new `useRealtimeBookings` hook using `postgres_changes` on `bookings` and `rolos_booking_rooms`, consumed by `PMSDashboard.tsx`, `PMSRooms.tsx` and the Command Centre overbooking/alert hooks. Requires the two tables added to the realtime publication.
- No change to booking references, rate resolution or channel push behaviour.
