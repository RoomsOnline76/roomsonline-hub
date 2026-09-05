---
name: RU Amenity Catalogue
description: Rentals United amenity dictionary sync, room amenity token format, and the 10-per-unit submission minimum
type: feature
---

- `public.ru_amenities` caches RU's `Pull_ListAmenities_RQ` dictionary (~1637 entries) with a derived `category` and a curated `is_recommended` flag. Re-sync via `rentalsunited-api` action `sync_amenities` (classification happens in `classifyAmenity`).
- Room/unit amenities are stored on `properties.amenities.room_types[].amenities` as `ru:<AmenityID>` tokens. Legacy free-text labels remain supported and are resolved through `supabase/functions/_shared/ruAmenityMap.ts` (`resolveRuAmenityIds`).
- No amenity padding on push: `push-property-to-ru` sends only real resolved IDs. RU's minimum of 10 amenities per unit is a readiness blocker (`rooms_meet_min_amenities`, `RU_MIN_AMENITIES`).
- UI: `src/components/property/RUAmenityPicker.tsx` (grouped, searchable, recommended-first, progress to 10) is used in Rooms → Amenities for both /admin/edit property and ROLOS Property Setup.
- Space-scoped slices: `src/lib/ruSpaceAmenities.ts` (`RU_SPACE_CATEGORIES`, `filterSpaceAmenities`) narrows the dictionary per physical space — `bedroom` / `living` (per-bedroom picker in `BedComposition`) and `kitchen` ("What's in it" dialog next to the Rooms-tab Kitchen tick, saved into the unit amenity list). Already-selected ids are never hidden by the filter. `RUAmenityPicker` takes `space?: RuSpaceKind`.
