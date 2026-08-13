# Tidal Pools: delete the retired ALL-CAPS rooms

Tidal Pools currently carries each unit three times in ROL'OS: one room-type header, the live unit, and a superseded ALL-CAPS copy. The plan removes the ALL-CAPS layer for good and stops it coming back.

## What the data shows

Tidal Pools has 8 unit rows and 8 room types — 4 live and 4 ALL-CAPS duplicates:

| Live unit (keep) | Bookings | ALL-CAPS copy (delete) | Bookings |
| --- | --- | --- | --- |
| Elf | 60 | ELF | 0 |
| Geelstert | 63 | GEELSTERT | 1 |
| Leervis | 55 | LEERVIS | 1 |
| Wildeperd | 57 | WILDEPERD | 1 |

The 3 bookings still sitting on ALL-CAPS units are all **cancelled** Rentals United test reservations ("Me Then", "Me Now", "You Maybe"), so no live occupancy is attached.

Other references to the ALL-CAPS room types:
- 4 links on the shared "Rack" rate plan (which has 22 links in total)
- 12 season-rate rows
- Nothing in inventory calendar, stay restrictions, booking rooms, housekeeping, or maintenance
- The channel mapping table (`hostfully_room_types`) holds only the 4 correct lowercase units, each with its own Rentals United id — the ALL-CAPS copies were never published upstream

## The cleanup

1. Re-point the 3 cancelled RU reservations onto the matching live unit and room type, so the records stay searchable and nothing is silently deleted.
2. Delete the 4 ALL-CAPS rate-plan links and their 12 season-rate rows (the live types keep their own rates untouched).
3. Delete the 4 ALL-CAPS unit rows and the 4 ALL-CAPS room types.
4. Re-verify: Tidal Pools should end with exactly 4 room types and 4 units, and the Rooms / Dashboard calendars should show one band per unit instead of three.

No channel push is needed — the ALL-CAPS records never existed upstream, and availability for the live units is unchanged by this cleanup.

## Stopping the recurrence

The duplicates were created by case-sensitive name lookups during room-type sync: a feed returning `WILDEPERD` did not match the existing `Wildeperd`, so a second type and unit were created. Room-type sync and the canonical-room resolver will compare names case-insensitively (trimmed, collapsed whitespace), so a differently-cased name resolves to the existing unit instead of creating a new one.

## Technical notes

- Data changes only, no schema change: a single data statement set scoped to property `Tidal Pools Self Catering Apartments`, touching `bookings` (3 rows re-pointed), `rolos_rate_plan_season_rates`, `rolos_rate_plan_room_types`, `rolos_rooms`, `rolos_room_types`.
- Deletions are keyed on the 4 known ALL-CAPS ids, not on a `name = upper(name)` pattern, so no legitimately capitalised unit elsewhere can be caught.
- Case-insensitive matching lands in `src/lib/pmsRoomTypeSync.ts` and `supabase/functions/_shared/canonicalRooms.ts`; no behaviour change for properties without duplicates.
