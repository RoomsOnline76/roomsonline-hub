# Amenity ownership: rooms own room amenities

## What changes for you

- **Rooms tab gets a new "Property Amenities" sub-tab.** The channel amenity picker (the RU-aligned list, plus the TOBI amenity check) moves out of the Facilities tab and into Rooms, next to the existing per-room "Amenities & Facilities" sub-tab. One place for everything the channel consumes.
- **Facilities tab keeps only ROL'OS website facilities.** The plain checkbox grid (General, Business & Reception, Meals & Dining, View, Languages, Transport & Parking, etc.) stays there, clearly labelled as website-only presentation.
- **Composition (property-wide fallback) card is removed** from the Facilities tab. Bedrooms / bathrooms / toilets / separate kitchen are captured per unit in Rooms, which is what the channel actually publishes.
- **Property Surroundings opens expanded** instead of collapsed.
- **Each room carries its own amenity set.** Three rooms means three independent sets. Property facilities are never borrowed as a room's amenities in the channel push any more — what you tick on the room is exactly what is published for that room.
- **Copy to all rooms.** From a filled room, copy its amenity set to every other room with a choice of **Overwrite all** (replace each room's set) or **Merge** (add missing amenities, keep what is there). A confirmation names how many rooms are affected.
- **A room amenity edit pushes only that room.** Changing one room's amenities on an eleven-unit property costs one channel write, not eleven.

## Also folded in (already in progress)

- Property name change fires a content-only channel delta (no availability/rates).
- New per-room **Default guests** field (alongside Max guests) published as the channel's standard-occupancy value; a change fires a content delta only.

## Technical detail

**UI**

- `src/components/property/RoomManagerTab.tsx`
  - New top-level sub-tab `property-amenities` holding the property-scoped `RUAmenityPicker` (`scope="property"`), the TOBI property amenity dialog, and the kitchen/facility sync side effects currently inline in `PropertyForm`. Values are threaded in as new props (`selectedFacilities`, `setSelectedFacilities`, `separateKitchen`, `setSeparateKitchen`, `aiAmenityOpen` state) so `PropertyForm` stays the state owner.
  - In the existing per-room `amenities` sub-tab: add a "Copy to all rooms" control (dropdown with Overwrite all / Merge) that maps over `roomTypes`, writes via `updateRoomTypeField`, keeps each room's `separateKitchen` in step with `hasSeparateKitchen()`, and marks the form dirty.
  - Add the `Default guests` input on the room-type sub-tab (persisted as `min_guests`/`standard_guests` on `hostfully_room_types`, decided when wiring — must be a column already in `UNIT_STATIC_COLUMNS`).
- `src/pages/PropertyForm.tsx`
  - Delete the "Composition (property-wide fallback)" card (≈6373-6460) and the "Property Amenities & Facilities" card (≈6461-6560) from the `info-facilities` tab; pass their state down to `RoomManagerTab` instead. `propBedrooms/propBathrooms/propToilets/separateKitchen` state and its save-time write stay intact (still the fallback in the payload builder), just no longer editable here.
  - Property Surroundings `Collapsible defaultOpen={true}`.
- `src/components/property/InfoFacilitiesTab.tsx` — keep the `FACILITIES` checkbox grid, retitle to "Website Facilities (ROL'OS listing)" with a one-line note that channel amenities live in Rooms.

**Channel push**

- `supabase/functions/push-property-to-ru/index.ts` (≈1662-1670): drop the additive merge of `mapAmenities(property.amenities)` into `unitAmenities`. Unit amenities come from the unit only. The composition-derived amenities (Bathroom 81, WC 37, Kitchen 101/135) keep their existing unit-first resolution via `resolveUnitComposition`, so a unit with no value still falls back to the property numbers — that is a quantity fallback, not a facility list.
- Guard: if a unit resolves to fewer than the channel's mandatory amenity floor, the readiness gate reports it per unit (existing "at least 10 mapped amenities" rule already surfaces this in the editor).

**Delta scoping**

- `supabase/functions/_shared/ruStaticDelta.ts`: `properties.amenities` is hashed as a single `property.amenities` field, and `RoomManagerTab` mirrors room types into `properties.amenities.room_types`. Any room amenity edit therefore invalidates a `property.*` field and `scopeUnitIdsFromChanges` widens the push to every unit.
  - Fix: fingerprint `property.amenities` with the `room_types` mirror (and `changeover_by_unit`, already unit-scoped elsewhere) stripped out, since units are fingerprinted canonically from `hostfully_room_types`. Keep the full object in `staticSnapshotHash` so a mirror-only change still counts as "something changed".
  - Room amenity + default-guests changes then land as `unit:<id>.amenities` / `unit:<id>.<guests column>` and scope to that unit alone.
- `src/lib/channelPushFields.ts`: label `amenities.facilities` as property amenities (content section) and add the default-guests path so the save summary names the change correctly.

**Verification**

- Edit one room's amenities on a multi-unit test property, save, and confirm `ru_sync_runs` records `scope: units` with a single `scope_unit_ids` entry and no availability/rates calls.
- Read back that unit at the channel and confirm the property-only facilities no longer appear on it.
