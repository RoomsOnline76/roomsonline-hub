# Amenity push parity with the Channel Manager

Two symptoms on RU Test Clone B (Tidal Pools copy): the channel listing shows only four amenities (Terrace, Separate kitchen, Internet, Parking) while ROLOS has 11-14 selected per unit, and the channel records a separate kitchen although the ROLOS "separate kitchen" toggle is off on every unit.

## What the reads confirm

- ROLOS data is correct and complete: each unit in `hostfully_room_types.amenities` and `properties.amenities.room_types[].amenities` holds 11-14 `ru:<id>` tokens (fridge, cookware, crockery, kettle, microwave, toaster, dining table, bathroom, bedrooms, BBQ, kitchen), and property `amenities.facilities` holds internet, parking, satellite TV, terrace, no-smoking, no-pets plus ROLOS-only labels.
- Every one of those ids exists in the synced channel dictionary (`ru_amenities`, from the channel's own amenity list), so nothing is an invented id.
- The push merges unit + property amenities and emits every one as `<Amenity Count="n">id</Amenity>` in the root `<Amenities>` block; the delta fingerprint already covers property `amenities` and per-unit `amenities`, so the change-detection side is not the gap.
- The four amenities the channel is showing are exactly the ones the channel treats as property-level features; the ones missing are all in-room item categories (kitchen, bathroom, bedroom, entertainment). `ru_amenities.ru_group_id` is null for all 1637 rows, so ROLOS currently has no way to tell the two kinds apart — the dictionary sync is dropping the channel's amenity type/group id.
- `separate_kitchen` is false on the property and `separateKitchen` is false on all four units, yet amenity 101 (Kitchen) is selected on every unit — that selection is almost certainly what makes the channel record a separate kitchen. The composition-room Kitchen block is deliberately not sent, so the toggle itself is not the source.

Root cause for the missing amenities is therefore strongly indicated but not yet proven at the channel: item-type amenities sent only at the root level are being ignored, and ROLOS cannot classify them because the group id is missing. Step 1 below proves it before anything is changed.

## Plan

### 1. Prove it with a read-back (first step, no behaviour change)
Use the existing `get_property` read-back for each of the four channel listings and diff "sent vs stored" amenities. Record the result so the fix targets the confirmed set:
- if the channel stored none of the item-type ids → root-level placement is the problem (proceed to step 3);
- if it stored them but the public page only renders a curated subset → the data is fine and only the ROLOS-side reporting/toggle work (steps 2 and 4) is needed.

### 2. Restore the amenity type/group in the dictionary
Re-sync the amenity dictionary keeping the channel's amenity type id, and back-fill `ru_amenities.ru_group_id`. This gives both the picker and the push a real classification (property feature vs in-room item) instead of ROLOS guesswork.

### 3. Send in-room items where the channel expects them
For amenities classified as in-room items, emit them inside the per-unit `CompositionRoomsAmenities` blocks that already exist (bedroom blocks today), adding Bathroom (81) and Kitchen (101) room blocks only when they carry at least one child amenity — that avoids the empty-`<Amenities>` rejection the current code comments warn about. Property-feature amenities stay in the root block exactly as now. Bed amenities keep their current bedroom-only placement.

### 4. Make "separate kitchen" coherent
Kitchen presence must have one source of truth. The unit-level kitchen selection and the "separate kitchen" toggle get reconciled on save: selecting a kitchen amenity sets the flag, clearing it clears the flag, and the push derives the kitchen room block from the reconciled value only. Existing units with a kitchen amenity but the flag off are corrected in a one-off back-fill so the channel and ROLOS agree.

### 5. Report what the channel actually accepted
Extend the amenity read-back into the channel content/coverage view so a missing amenity is visible per listing (sent, accepted, dropped) rather than being discovered on the channel's public page.

## Technical notes

- Read-back: `rentalsunited-api` action `get_property` (Pull_ListSpecProp_RQ) per unit id (5655615/16/17, 5763781).
- Dictionary: `extractAmenities` / `sync_amenities` in `supabase/functions/rentalsunited-api/index.ts` already parse `AmenityTypeID`; verify why it lands null and persist it, then add a `scope`/item classification derived from it in `src/lib/ruAmenities.ts`.
- Push: `mapAmenities` + `buildUnitPayload` in `supabase/functions/push-property-to-ru/index.ts`, XML in `buildPushPropertyXml` (`rentalsunited-api`).
- Kitchen flag: `RoomManagerTab.tsx` (unit `separateKitchen`), `PropertyForm.tsx` composition card, `resolveUnitComposition` in the push.
- No schema change beyond back-filling `ru_amenities.ru_group_id`; kitchen back-fill is a data update on `properties.amenities.room_types[]` and `hostfully_room_types`.
- Functions to redeploy: `rentalsunited-api`, `push-property-to-ru`, `ru-static-delta`.
