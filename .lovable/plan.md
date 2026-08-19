# Live two-way booking sync with the channel

Goal: every booking action in ROL'OS reaches the channel automatically (create, move, date change, pax change, price/deposit change, notes, confirm, cancel, no-show), every channel action stays visible in ROL'OS within seconds, and rate-limit deferrals are visible to the user instead of silent.

## What the audit found (verified this turn)

Outbound (ROL'OS to channel) gaps:

- Moving a booking to a different unit with the same dates performs a direct database update and only re-pushes rates/availability. No `Push_ModifyStay_RQ` is sent, so a channel-sourced booking keeps its old unit on the channel.
- When dates do change, the channel push happens before the unit is written, and the current-stay listing id is resolved from the new mapping, so the channel is told the wrong listing.
- Quick actions on the dashboard (mark paid/confirm, cancel, no-show) and the cancel action on the Bookings page write the status straight to the database, bypassing the cancel path entirely. No cancellation or rejection is pushed, and availability is never released.
- Guest/pax edits, notes, and total-price edits (booking details grid, notes tab, view-rates dialog) write directly with no channel push, so guest count, price and already-paid values drift.
- Manual booking creation pushes no availability delta at all. There is no database trigger on `bookings` or `rolos_booking_rooms` that queues a channel sync, so any surface that writes directly silently skips the channel — the overbooking risk the drag-and-drop report exposed.
- All existing client-side sync calls are fire-and-forget with console logging only; a rate-limit deferral is never surfaced.

Inbound (channel to ROL'OS) is already live: notification ingest with owner-first lookup, rate-limit parking, the ~40s queue drain, and realtime booking subscriptions on Dashboard and Rooms.

## Plan

1. Single outbound entry point — new `channel-booking-sync` edge function
   Takes a booking id and a change kind, then: resolves whether the booking came from the channel and pushes modify / cancel / reject accordingly; always queues the availability + rates delta for the property so locally created, moved and cancelled stays release or block inventory on the channel. Field coverage: dates, listing (unit) change with explicit from/to listing ids, guest counts, client price, already-paid, arrival time, note. Every call funnels through the existing rate gate; a deferral is enqueued on the call queue and reported back as `deferred` with a wait estimate rather than failing.

2. Never-bypassed enqueue — database trigger
   Add an after insert/update/delete trigger on `bookings` (and on `rolos_booking_rooms` for unit lines) that enqueues a channel booking-sync job whenever a field the channel cares about changes. The queue drain executes step 1, so even direct writes from any screen reach the channel. This makes correctness independent of which button the operator used.

3. Fix the move path
   Write the unit/room-type change first, then call the sync with both the previous and the new listing, so the channel receives one correct modify instead of a stale one. Guests, dates and price ride along in the same push.

4. Route the bypassing surfaces through the proper paths
   Dashboard quick actions and the Bookings page cancel call the cancel path (which pushes cancel/reject and frees availability) instead of writing status directly. Details/notes/rates edits call the sync with the changed fields.

5. Toasts and status
   One shared client helper reports outcomes: "Channel updated", "Queued — the channel rate limit is in effect, this will complete in about Ns" (with a follow-up success toast when the queued job lands), or a clear failure with the channel's reason. Sync state per booking is recorded in `booking_sync_status` so the booking drawer can show last action, time and any error.

6. Verification
   For a channel-sourced test booking: move to another unit, shift dates, change pax, change price, cancel — confirm each produced a logged channel request with the expected method and fields, and that a locally created stay blocks the night on the channel. Confirm a deliberate rate-limit collision defers and then completes from the queue.

## Technical notes

- Reuses `_shared/ruBookingSync.ts` (`modifyRuStay`, `cancelRuReservation`), `_shared/ruRateGate.ts`, `ru_call_queue` and `ru-ari-delta`; adds explicit previous-listing handling to the modify payload.
- Log rows keep the certification fields already in place (`transport_status`, `error_reason`, `changed_fields`, `push_type`), including `not_attempted` rows for aborts.
- Trigger enqueues only, never calls out, so booking writes stay fast.
