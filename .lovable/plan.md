# NightsBridge import landed on dead rooms — hard gate, repair and re-sync

## What the data actually shows

Confirmed by querying the database:

- **Tidal Pools** has duplicate room types: 7 rows named "Elf", 7 "Geelstert", 7 "Leervis", 7 "Wildeperd", plus duplicate physical rooms — a mixed-case set (`Elf`, `Geelstert`, …) and an ALL-CAPS set (`ELF`, `GEELSTERT`, `LEERVIS`, `WILDEPERD`).
- **All 235 imported NightsBridge bookings for Tidal Pools point at the April-created room types that are backed by the ALL-CAPS rooms.** The current rooms carry zero booking data.
- **Seesig** has the same duplication disease (up to 19 rows per name, plus ALL-CAPS copies), but its imported bookings did land on the live mixed-case types.
- Nothing in the database marks the ALL-CAPS set as archived: `rolos_rooms` has no active flag at all, and the duplicate room types are flagged active. The importer matches on a lower-cased name, so `ELF` and `Elf` collide and whichever row is returned first wins.
- The channel link is broken too: all four Tidal Pools channel units point their `linked_rolos_id` at room-type ids that no longer exist.
- Inventory never reaches the channel: the availability push matches a channel unit's own id against `bookings.room_type_id` (which holds a ROL'OS room-type id), the imported bookings have an empty `rooms` array, and the push never reads the `rolos_booking_rooms` lines the importer wrote. So no imported stay closes a night upstream.

That is four separate failures stacked on each other.

## The fix

### 1. One canonical room registry (shared helper)

A single resolver decides, per property, the one canonical room type and physical room per room name:

- Canonical = active room type whose name matches an active channel unit (case-insensitive), preferring the row already linked to that unit.
- Everything else with the same name is treated as **superseded** — never selectable, never matched, never pushed.
- Used by the importer, the repair tool and the availability push so all three agree.

### 2. Hard gate in the NightsBridge importer

- The room index is built **only** from canonical, non-superseded rooms. Superseded and inactive rooms are excluded before matching, so an ALL-CAPS twin can never win a name collision again.
- A spreadsheet room name that only matches a superseded room is reported in the dry run as "room no longer exists — pick a current room", and cannot be imported until the operator maps it (existing override / skip / exclude controls are reused).
- Operator overrides pointing at a superseded room are rejected with a clear message.
- The dry-run summary gains a "superseded rooms blocked" count so the gate is visible before writing.

### 3. Repair the damage already in the database

A repair run (admin-triggered, dry-run first) that:

- Re-points the 235 Tidal Pools bookings, their `rolos_booking_rooms` lines and `room_type_id` values to the canonical room and room type for the same room name.
- Repairs the broken channel links (`linked_rolos_id` on the channel units and `linked_overview_id` on the room types).
- Removes the superseded ALL-CAPS rooms and the duplicate room types **only after** nothing references them — for Tidal Pools and Seesig both.
- Reports every action; nothing is deleted while it still carries bookings, rate links or channel references.

### 4. Push the recovered inventory upstream

- The availability builder resolves a channel unit to its canonical room type ids (link + name), and falls back to `rolos_booking_rooms` when `bookings.rooms` is empty, so imported stays close nights.
- After the repair, availability is re-pushed for Seesig and Tidal Pools so the channel finally reflects the imported occupancy.

### 5. Stop the duplicates coming back

- The room-type sync (daily function and the in-app sync) matches case-insensitively and never inserts a second type for a name that already exists; it links instead.
- Once the cleanup has run, a database uniqueness rule per property + lower-cased name for active room types prevents a re-run from re-creating twins.

## Technical notes

- New shared resolver `supabase/functions/_shared/canonicalRooms.ts` (property → canonical room/room-type per normalised name, plus the superseded id set).
- `supabase/functions/nb-import-bookings/index.ts`: filter `roomIndex` and `repairUnmappedBookings` through the resolver; add `blocked_superseded` to the dry-run payload and reject overrides referencing superseded ids.
- `supabase/functions/push-property-to-ru/index.ts` → `loadBookingBlocks`: match on canonical type ids for the unit and read `rolos_booking_rooms` when `rooms` is empty.
- New repair action inside the NightsBridge import function (`action: "repair_superseded_rooms"`, `dry_run` supported) surfaced on the existing NightsBridge import panel; deletions run last and are skipped when references remain.
- Data changes (re-pointing bookings, deleting duplicate rooms/types, fixing links) run through the data tool, not schema migrations; the uniqueness rule is a separate migration applied after cleanup.
- `supabase/functions/sync-rolos-room-types/index.ts` and `src/lib/pmsRoomTypeSync.ts`: case-insensitive match-then-link, no blind inserts.
