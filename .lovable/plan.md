# Fix: RU request 146987241 not appearing on the Tobie unit

## What is actually wrong

The reservation did arrive. It exists as booking **ROL-SEE-0670** (Seesig Self Catering Chalets, status `pending`, source `rentalsunited_lead`, guest "Dawie TEST 4").

It is not shown against Tobie because it was linked to the **wrong copy of the Tobie room type**. Seesig has 19 room-type rows named "Tobie" (and ~25 named "Oester") — leftovers from earlier sync runs. Only one is active (`2346d39b…`, the one the Tobie unit and calendar use). The reservation was stamped with an archived copy (`519d19e2…`, inactive), and it has no room lines in the room-link table, so the grids have nothing solid to anchor it to on the Tobie row.

Cause, confirmed in code: when an incoming channel reservation maps a channel unit to a ROL'OS room type, the lookup takes the **first** name match and ignores whether that row is active or archived. With duplicates present it can pick an archived twin.

## The fix

1. **Resolve to the canonical unit, never an archived twin.** The channel-unit resolver must prefer the active, most recently created room type for that name (the same canonical rule the rest of the system already uses), and also return the physical unit row.
2. **Anchor the stay on the unit immediately.** On ingest, write the resolved physical unit onto the booking so the Rooms and Dashboard calendars place it on the Tobie row the moment the notification lands — no manual assignment, no refresh.
3. **Repair the affected data.** Re-point ROL-SEE-0670 to the active Tobie type and unit so it appears on the Tobie row right away.
4. **Clear the duplicate backlog for Seesig.** Remove the archived duplicate room-type rows that carry no bookings, rates or channel links, keeping one canonical row per unit name. Duplicates that are still referenced stay in place and get re-pointed rather than deleted.

## Technical notes

- `supabase/functions/_shared/ruReservationParsing.ts` — `resolveRuUnit()`: order name matches by `is_active desc, created_at desc`; extend `ResolvedRuUnit` with `roomId` sourced from `rolos_rooms` for the canonical type.
- `supabase/functions/_shared/ruReservationIngest.ts` — include `rolos_room_ids: [roomId]` in the insert/update field set when the booking has no unit yet (both the request/hold path and the confirmed path).
- Data migration: update `bookings.room_type_id` / `rolos_room_ids` for the affected reservation; delete unreferenced inactive `rolos_room_types` duplicates for Seesig.
- No change to the availability-block path, which keys off the channel mapping row, not the ROL'OS type.
