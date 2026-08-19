# Full booking action trail in Diagnostics (inbound + outbound)

## What is true today

- Outbound: only two booking verbs ever reach the exchange log — `ruBookingSync:modify` and `ruBookingSync:cancel`. Everything else (a locally created stay, a pax/price/deposit edit, a confirm, a no-show on a stay the channel does not hold) resolves as `skipped` and leaves no diagnostics row at all; the availability/rates delta it triggers is queued under a generic reason and is not tied back to the booking.
- Inbound: the exchange log holds **zero** inbound rows (33,390 outbound, 0 inbound over the last 10 days). Channel notifications are recorded in the notification queue only, so Diagnostics cannot show what the channel actually sent us.
- Notes are not detected at all: the database trigger that queues background sync branches on dates, unit, pax, price, payment and status — never on notes/special requests. A notes edit therefore neither syncs nor logs.
- No-show and confirm are detected (they land in the cancel and status branches respectively).

## What to build

### 1. One durable booking-event trail

New table `channel_booking_events`: booking id, property id, unit id, direction (`outbound`/`inbound`), action (`created`, `moved`, `dates`, `pax`, `price`, `deposit`, `notes`, `confirmed`, `cancelled`, `no_show`), source (dashboard drag, booking drawer, background job, channel notification, reconciliation pull), outcome (`pushed`, `queued`, `skipped`, `failed`, `ingested`), a reason code, the channel reservation/listing id, the trace id that links to the raw exchange, and a short human summary.

Every path writes exactly one row per action:
- The single outbound sync entry point records the row for all nine verbs, including the `skipped` cases, with the reason it was skipped (`local_only_stay`, `reservation_absent_at_channel`, `no_channel_account`) — a skip is evidence, not silence.
- The inbound notification handler and the reconciliation pull record an `inbound` row per reservation block with the classified event (confirmed / modified / cancelled / request) and the ingest outcome.

### 2. Raw inbound exchanges in the exchange log

Inbound notification bodies get written to the exchange log with `direction = 'inbound'`, the classified action, the reservation and listing ids, and the same trace id as the event row — so an operator can open a booking event and read the exact XML the channel posted, in the same place they already read outbound XML.

### 3. Close the gaps that produce no action

- Add a notes/special-requests branch to the sync trigger so a notes edit is detected, logged and (where the channel holds the stay) pushed.
- Split deposit changes from generic payment so `price` and `deposit` read distinctly.
- Distinguish no-show from a guest cancellation instead of folding both into `cancelled`.

### 4. Diagnostics UI

Add a **Booking sync trail** panel to the existing Diagnostics tab, above the exchange log:
- Filters: direction (both / outbound / inbound), action, outcome, property, reference or reservation id, time window.
- Each row: time, direction arrow, action, booking reference, outcome chip, reason, and a link that opens the linked raw exchange.
- A coverage strip across the top: for the selected window, which of the nine actions have been observed in each direction — so "is every action logged?" is answerable at a glance rather than inferred.
- Add a direction filter to the existing exchange log too, now that inbound rows exist.

## Technical notes

- New table needs GRANTs plus RLS: platform roles (admin/dev/fearless_leader) read all; property owners and staff read rows for properties they can access; writes are service-role only (edge functions).
- Event writes are best-effort and wrapped — bookkeeping must never fail a sync or reject a channel notification.
- Retention mirrors the exchange log's existing prune job so the trail does not grow without bound.
- Files touched: `_shared/channelBookingSync.ts`, `_shared/ruReservationIngest.ts`, `ru-reservation-handler`, `cron-pull-ru-reservations`, `_shared/ruApiLog.ts` (inbound helper), the sync trigger function, a new `src/hooks/useChannelBookingEvents.ts`, a new panel under `src/components/admin/channel-monitor/`, and `AdminChannelMonitor.tsx`.

## Verification

Exercise all nine actions on a channel-backed stay and a local-only stay, plus one inbound confirm/modify/cancel, then confirm the coverage strip shows every action in both directions with the expected outcomes.
