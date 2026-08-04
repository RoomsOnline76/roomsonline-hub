# Unit-level property composition for Rentals United

Today the RU composition (bathrooms, toilets, separate kitchen, floor, size) is captured once for the whole property and applied to every unit. Units already carry Size, Floor and Baths in the Rooms tab, but Toilets and Separate kitchen exist only at property level, and the RU push uses the property-wide toilets/kitchen values for every unit.

## What changes

- The Rooms tab (Setup / Edit Property → Rooms, and the same tab inside ROLOS) gets two new per-unit fields next to the existing Size / Floor / Baths inputs:
  - **Toilets** — number, blank means "use the property fallback".
  - **Kitchen — Separate** — checkbox per unit.
- The property-level Composition card is relabelled as a **fallback / property default** (not the value pushed): it stays mandatory-looking only where no unit value exists, and its helper text explains unit values win.
- The Rentals United push resolves composition per unit in this order: unit value → property fallback → no value (so readiness reports the gap instead of inventing one).
  - Bathrooms: unit `bathrooms` → property `bathrooms`
  - Toilets: unit toilets → property `toilets`
  - Separate kitchen: unit flag → property `separate_kitchen`
  - Floor and Size: unchanged behaviour (unit value → property fallback), already correct.
- Readiness / channel-content checks keep working unchanged because they read the pushed payload's amenity counts, which will now be per unit.

## Technical notes

- `src/components/property/RoomManagerTab.tsx`: add `toilets` (nullable number) and `separateKitchen` (boolean) to the room-type shape and `addRoomType` defaults, plus the two inputs in the composition grid. These persist in `properties.amenities.room_types[]`, the same place unit `floor` already lives — no schema migration needed.
- `supabase/functions/push-property-to-ru/index.ts`: add a `resolveUnitComposition(property, unit)` helper that matches the pushed unit back to its `amenities.room_types[]` entry (same matching logic as `resolveUnitFloor`) and returns `{ bathrooms, toilets, separateKitchen }` with property-level fallbacks. Use it in `buildUnitPayload` in place of the current property-wide reads for amenity ids 81 (Bathroom), 37 (WC) and 101 (Kitchen), and in `buildBuildingPayload`/primary-room path for consistency.
- `src/pages/PropertyForm.tsx`: reword the Composition card copy to "property-wide fallback — unit values in the Rooms tab take priority", keeping the existing fields and Req markers.
- No changes to bedrooms/bed handling — `CompositionRoomsAmenities` already derives bedrooms from each unit's bed configuration.
