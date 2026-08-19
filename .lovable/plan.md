# Live channel reservations: multi-unit stays, instant arrival, honest blocks

Three faults, all confirmed against the live data and code.

## What I verified

**1. Multi-unit reservations lose every unit but the first.**
Peter Parker's request (`147031997`) arrived at 18:13 as `LNM_PutUnconfirmedReservation_RQ` with an
empty `<StayInfos />`, so the stay detail is fetched back from the channel afterwards. Both the parser
and the ingest handle exactly one stay: `parseRuReservation` reads only the first `<StayInfo>` block,
and a booking is keyed on the reservation id alone (unique index `bookings_ru_external_reservation_uidx`).
So the second unit cannot even be written — one booking exists, on Karel Grootoog (listing `5833138`);
Perekil (`5842267`) was dropped silently.

**2. Arrival is not instant.** The channel notifies before it will serve the reservation. The first
detail pull fails, the notification is parked, and the shortest retry step is **1 minute** — and only
runs when the sweep cron fires. Peter Parker landed at 18:15:46, ~2m45s after the notification.

**3. Blocked nights are anonymous, so they leak.** Channel blocks are written to
`property_availability` as `external_system = 'manual'` with `blocked_by`, `blocked_by_label` and
`blocked_reason` all left empty, keyed only by the unit's **name**. Consequences seen in the data:
- a release can only find the block if the unit name still matches exactly — there are rows under
  `KABELJOU`, `LEERVIS`, `ELF` casings that no longer match, so those nights stay closed forever;
- nothing links a block to its booking, so nothing can clean it up and the operator deletes it by hand;
- orphaned closed nights exist today: Fonteinhutte `KABELJOU` (14), Latter Days (17), Tidal Pools and
  Seesig around 15–25 Dec (11 each);
- a release writes `available_units = 1` even on multi-unit inventory, and the block/release upsert
  targets a 4-column conflict key while the table also carries a 3-column unique index — a collision
  there fails the write and is only logged.

## The fix

### 1. One stay, every unit

- Parse **all** `<StayInfo>` blocks in a reservation (notification, detail pull and poll all share the
  one parser, so all three paths gain it at once).
- Ingest the reservation as a **single booking** — one guest, one reference, one total — with a unit
  line per stay block, so the grid draws it on both Karel Grootoog and Perekil.
- Availability is blocked and released **per unit line**, not just for the first one.
- Dates and total come from the union of the stay blocks (earliest arrival, latest departure, summed
  price), with each line keeping its own dates, listing id and price.
- Repeat notifications converge: added units are inserted, removed units are released, and the
  reservation stays one record.

### 2. Instant arrival

- When the reservation is not yet readable, retry inside the same invocation on a fast ladder
  (about 5s, 15s, 40s) in the background after the channel gets its OK, so a normal request lands in
  seconds instead of minutes.
- Only if that ladder is exhausted does the notification park for the existing minute-scale retries,
  and the first parked step drops from 1 minute to 30 seconds.
- Channel rate-limit answers still cost no retry attempt.

### 3. Blocks that own up to themselves

- Every channel-written block is stamped with the booking it belongs to and labelled as a Channel
  Manager block, so tooltips say who closed the night and why.
- Cancellations, released holds and unit changes clear **exactly their own** stamped nights — by
  booking, not by unit name — so a renamed or re-cased unit can no longer strand a block.
- A nightly sweep releases any stamped night whose booking is cancelled, released or gone.
- Operator blocks carry no booking stamp and are never touched.
- Releases restore the unit's real inventory instead of a hardcoded 1, and the block write uses the
  conflict key the table actually enforces.

### 4. One-off cleanup

After the above is live I list every orphaned channel-closed night (Fonteinhutte `KABELJOU`, Latter
Days, Tidal Pools, Seesig and the stale casings) for your confirmation, then clear them and let the
availability push carry the reopened nights to the channel.

## Verification

- Replay Peter Parker's reservation: expect one booking on two unit rows, both units closed.
- Cancel it at the channel: expect both units reopened, no leftover block.
- Confirm the booking-sync trail shows the inbound request, the modification and the cancellation.
- Re-run the orphan query and expect zero channel-stamped strays.

## Technical notes

- `supabase/functions/_shared/ruReservationParsing.ts` — multi-`StayInfo` parsing, stamped
  block/release keyed on booking id, real inventory on release, correct upsert conflict target.
- `supabase/functions/_shared/ruReservationIngest.ts` — reservation → one booking + `rolos_booking_rooms`
  lines; per-line availability; cancellation releases every line.
- `supabase/functions/ru-reservation-handler/index.ts` — fast in-request retry ladder before parking.
  This file is under an adapter lock; this plan is the explicit approval to change it.
- `supabase/functions/_shared/ruNotificationRetry.ts` — first backoff step to 30s.
- New sweep step in the existing reservation cron for stranded stamped blocks.
- No schema change needed: `property_availability.blocked_by` / `blocked_by_label` / `blocked_reason`
  already exist, and multi-unit stays use the existing booking room lines.
- Cleanup of existing orphan rows runs as a data change, listed for approval first.
