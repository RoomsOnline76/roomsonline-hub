# Unmapped bookings — current state and the remaining clean-up

## Answer: the 189 Seesig bookings are still unmapped, but none of them can block anything

Verified in the database just now:

- 189 Seesig NightsBridge bookings still have no room type (180 confirmed, 9 pending) and no room lines in `rolos_booking_rooms` either.
- Every one of them is **historical**: the latest check-out is 2026-06-12, all before today. So they never affect channel inventory and never needed a canonical room for availability.
- For all current/future stays, Seesig and Tidal Pools are now **fully mapped**: 77 future Seesig bookings and 49 future Tidal Pools bookings, zero unmapped.

So the mapping work that mattered for the channel is done. What is left is only historical tidiness plus 4 unrelated stays:

| Property | Future bookings with no room | Source |
| --- | --- | --- |
| Fonteinhutte Self-Catering Chalets | 3 | native ROL bookings (Oct/Dec 2026) |
| Dassiesingel Self-catering Units | 1 | native ROL booking (Oct 2026) |

These 4 are not NightsBridge imports — they are native ROL bookings created without a room type, so they also don't close nights upstream.

## Proposed work

### 1. Map the 4 future native bookings (the only ones that affect inventory)
- Add these to the existing repair tool as a blocking to-do: property, dates, guest, and a room picker limited to canonical rooms.
- On assignment, write both `room_type_id` and the `rolos_booking_rooms` line, then queue the channel delta for the affected unit and date range.

### 2. Historical Seesig backlog (189) — non-blocking
- Attempt automatic mapping from the original import row's room name via the canonical resolver; whatever matches gets a room, purely for reporting accuracy.
- Anything still unmatched is reported as "historical, unmapped — no channel impact" and never queues a delta (past dates are never pushed).

### 3. Prevent recurrence
- The repair panel gains a permanent counter split into "future unmapped (blocking)" and "historical unmapped (informational)", so a future occurrence is visible immediately rather than discovered by a channel gap.

## Technical notes

- Blocking set query: `bookings` where `room_type_id is null and check_out_date >= current_date`, scoped to the selected property.
- Assignment goes through `supabase/functions/_shared/canonicalRooms.ts` so a superseded room can never be picked.
- Delta re-queue reuses `queueRuAriDelta` in `nb-import-bookings` (same path the import already uses), with gate parking when the property isn't push-ready.
- UI changes in `src/components/property/NightsBridgeBookingImport.tsx`; no schema change.
