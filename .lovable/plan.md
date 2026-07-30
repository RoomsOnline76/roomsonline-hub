## What I checked

You're right — there is no way to set a floor for a room type in the ROLOS property setup.

- The room editor (`RoomManagerTab`) has **Size (m²)**, Baths, Max guests, beds — but **no Floor** field.
- The only `floor` field that exists today is on *physical rooms* (`rolos_rooms`, Rooms page in ROLOS) — that's housekeeping/room-numbering data, and it is never read by the channel push.
- The Rentals United push hardcodes `floor: 0, floor_is_default: true` for both the building payload and every unit payload.
- The RU readiness scorer therefore always reports the advisory warning "Floor number is not set — sending the default (ground floor)" and points to a field that does not exist: "Rooms → Unit → Floor".

## Plan

**1. Add Floor to the room type editor**
- New numeric input "Floor" next to "Size (m²)" in the room/unit grid, stored as `amenities.room_types[].floor` (same pattern as `roomSize`).
- Allow negative values (basement/lower ground) and empty = not set; helper text: "Ground floor = 0. Used by channel managers (Rentals United)."
- Include `floor` in the room-type save mapping in `PropertyForm.tsx` and in the default new-room-type object, plus the PMS-sync field lists so it isn't wiped on sync.
- Register the field in the internal field map / PMS field mappings so it appears in field registry tooling alongside Room Size.

**2. Optional property-level default**
- Where a property has one building/many units, add a fallback: if a room type has no floor, use the physical room's floor from `rolos_rooms` when a matching unit exists; otherwise fall back to 0 as today.

**3. Wire it into the Rentals United push**
- Unit payload: `floor = unit.floor ?? matchedRoomFloor ?? 0`, `floor_is_default = floor was not explicitly set`.
- Building payload: use the primary room type's floor with the same fallback rule.

**4. Readiness scorer**
- No rule change needed (floor stays advisory), but the warning now clears once a floor is entered, and the "where to fix" hint stays accurate: Rooms → Unit → Floor.

## Technical notes

Files affected:
- `src/components/property/RoomManagerTab.tsx` — new Floor input
- `src/pages/PropertyForm.tsx` — default room type, load mapping (~line 2293/2349), save mapping (~line 3148)
- `src/hooks/usePMSSync.tsx` — preserve `floor` in the sync-protected field lists
- `src/config/internalFieldMap.ts`, `src/config/pmsFieldMappings.ts` — field registry entries
- `supabase/functions/push-property-to-ru/index.ts` — replace the two hardcoded `floor: 0, floor_is_default: true` sites (unit ~line 601, building ~line 761) with resolved values

No database migration is required — room types live in the `properties.amenities` JSONB blob.
