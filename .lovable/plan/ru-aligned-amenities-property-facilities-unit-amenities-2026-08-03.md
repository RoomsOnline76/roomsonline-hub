# RU-Aligned Amenities: Property Facilities + Unit Amenities

Rework how amenities are captured so what owners select maps cleanly onto what Rentals United (and downstream OTAs) expect, with RU's popular options presented first.

## Current state (verified)

- Unit/room amenities already use the live RU dictionary (`ru_amenities`, ~1,600 rows) via the picker in Rooms, but "recommended" is almost meaningless: only 53 rows are flagged, and whole categories have 0-1 recommended entries. So owners must search for everything.
- Property-level facilities are a hardcoded ROLOS list (`InfoFacilitiesTab` / onboarding `StepFacilities`) with no RU mapping at all — it is stored as free text in `amenities.facilities` and only partially rescued by a legacy-label lookup table in the push function.
- `properties` has `bathrooms` (integer, not enforced), and **no** toilets count and **no** separate-kitchen flag. Room types carry `bathrooms` only.
- The RU push deliberately omits the Bathroom (81), WC (53) and Kitchen (101) composition blocks, so RU never receives bathroom/toilet/kitchen composition.

## What will change

### 1. Amenity catalogue metadata
Add curation columns to `ru_amenities`: `scope` (`unit` / `property` / `both`), `popular_rank` (integer, nulls last) and `ru_group` (Popular, Security & Safety, Policies, Accessibility, …). Seed them so:
- The RU "Popular amenities" set is ranked first: Internet, Linen & towels, Iron & ironing board, Parking, Satellite TV, Cable TV, Baby cot, Terrace, Dishwasher, Swimming pool, Heating, Air conditioning, Washing machine, Garden.
- RU property-level groups (Security & Safety, Policies, Accessibility) are marked `property`.
- The COVID-era "Cleanliness / Safety" block is excluded entirely, as requested.
- Existing ROLOS-only facilities that have no RU equivalent (game drives, spa treatments, languages, views, etc.) are kept as a clearly-separated "ROLOS website only" section so nothing already captured is lost.

### 2. Mandatory composition fields
- Add `toilets` (integer) and `separate_kitchen` (boolean) to `properties`, plus the same two fields per room type in the room JSON.
- Bathrooms and toilets become required to save/activate, and required for RU readiness (validation message, not a silent failure).
- "This property includes a separate kitchen / cooking area / kitchenette" becomes an explicit toggle with helper text stating it may be outside the unit.

### 3. New shared amenity picker
One component used by Edit Property, ROLOS Setup Property, and the onboarding wizard, in two modes (`property` / `unit`):
- **Popular first**: a dense grid of the ranked RU popular options, with count inputs on the four RU count-bearing items (Internet, Parking, Baby cot, Swimming pool).
- Then collapsible RU groups in RU's own order.
- Then "Search all channel amenities" for the long tail (existing behaviour).
- Then the ROLOS-only extras section.
- Keeps the channel-readiness meter (10-amenity minimum) and the legacy-label reconciliation already in place.

### 4. Page layout
- **Property page → Info & Facilities**: Composition card (bedrooms / bathrooms / toilets / separate kitchen) at the top, then Property Amenities in `property` mode. The old hardcoded facilities grid is replaced.
- **Rooms / Room type editor**: unit composition (bathrooms, toilets, kitchen) beside beds, then Unit Amenities in `unit` mode. The current ad-hoc "Cooking & Kitchen" style checkbox blocks are folded into the RU-backed picker.
- Both surfaces stay in the dense form rhythm already used across setup/edit.

### 5. Push + readiness
- `push-property-to-ru`: send property-level amenities from the new mapped selections, emit `CompositionRoomsAmenities` blocks for Bathroom (81) × bathrooms, WC (53) × toilets and Kitchen (101) when the separate-kitchen flag is set, and stop relying on padding.
- RU readiness scorecard / certification console gain checks for bathrooms, toilets, separate kitchen and "property amenities mapped", so a missing value surfaces before a push attempt.
- Legacy label map extended for any ROLOS facility that does have an RU id, so existing properties migrate without re-entry.

## Technical notes

- Migration: `ALTER TABLE public.properties ADD COLUMN toilets integer, ADD COLUMN separate_kitchen boolean DEFAULT false;` plus `ru_amenities` curation columns and an UPDATE seeding `popular_rank` / `scope` / `ru_group` by RU AmenityID. No new tables, so no new grants required.
- Property amenity selections stored as `ru:<id>` tokens in `amenities.facilities` alongside retained ROLOS-only labels, so `resolveRuAmenityIds` keeps working unchanged.
- Files touched: `src/lib/ruAmenities.ts`, `src/components/property/RUAmenityPicker.tsx` (generalised), new `PropertyAmenitiesSection`, `InfoFacilitiesTab.tsx`, `RoomManagerTab.tsx`, `StepFacilities.tsx`, `PropertyForm.tsx`, `supabase/functions/_shared/ruAmenityMap.ts`, `push-property-to-ru`, `ru-cert-portal`.
