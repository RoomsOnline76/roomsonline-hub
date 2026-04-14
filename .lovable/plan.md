

## Multi-Unit Building Push to Rentals United

### The Problem
You're right -- Seesig is a building containing multiple independent chalets, each with its own details and ARI (availability, rates, inventory). Currently we push "SEESIG" as a single property (RU ID 4691753), but we should be creating:

1. A **Building** in RU (grouping container) using `Push_PutBuilding_RQ`
2. Individual **Properties** per chalet (ANEMOON, SEESTER, SWARTMOSSEL, WITMOSSEL) using `Push_PutProperty_RQ` -- each with its own ARI

Per RU docs: *"Buildings serve the same purpose as folders. Multiunit properties must be assigned to buildings."*

### Current Data (Seesig)
- 4 active room types: ANEMOON (6 guests), SEESTER (5), SWARTMOSSEL (6), WITMOSSEL (7)
- Each has its own images and amenities
- Missing per-unit: bedrooms, bathrooms, beds, coordinates, address, check-in/out, cleaning fee (inherit from parent property)
- Parent property has: coordinates, address, amenities, images, seasons, rates

### Plan

**1. Add `Push_PutBuilding_RQ` support to `rentalsunited-api`**
- New action: `push_building`
- XML format: `<Push_PutBuilding_RQ><Authentication>...</Authentication><Building><BuildingName>SEESIG</BuildingName></Building></Push_PutBuilding_RQ>`
- Parse response for `BuildingID`

**2. Add `list_buildings` support to `rentalsunited-api`**
- New action: `list_buildings` using `Pull_ListBuildings_RQ`
- To check if building already exists before creating

**3. Add DB column for RU building ID**
- Migration: `ALTER TABLE properties ADD COLUMN rentalsunited_building_id TEXT`

**4. Rewrite `push-property-to-ru` orchestrator for multi-unit flow**
- Detect multi-unit: property has active room types (>0)
- Step 1: Create/update RU Building for the parent property -> store `rentalsunited_building_id`
- Step 2: For each active room type, push as an individual RU Property:
  - Name: room type name (e.g. "ANEMOON")
  - Inherit parent property's coordinates, address, amenities, check-in/out, cancellation policies, payment methods when room type data is missing
  - Use room type's own images and amenities where available
  - `BuildingID` set to the building created in Step 1
  - Each gets its own `rentalsunited_property_id` -> stored on `hostfully_room_types` table
- Step 3: Push availability per unit
- Step 4: Push prices per unit

**5. Add `rentalsunited_property_id` to room types table**
- Migration: `ALTER TABLE hostfully_room_types ADD COLUMN rentalsunited_property_id TEXT`
- Each chalet/unit gets its own RU property ID

**6. Update the existing Seesig RU property**
- The current single property (4691753) may need to be archived or repurposed
- First push will create the building + 4 individual properties

**7. Update UI component**
- Show building ID alongside property ID
- Validation: show per-unit readiness (images count per unit)
- Push button creates building + all units in sequence

### Technical Details

- `Push_PutBuilding_RQ` XML is simple: just building name + optional ID for updates
- Each unit property must include `<BuildingID>` in the `Push_PutProperty_RQ` XML (added after `<NoOfUnits>` or similar per XSD)
- ARI (availability + prices) is pushed per-unit using each unit's RU property ID
- Seasons are shared (property-level), but rates may differ per room type via `season_rates`

### Files Modified
- `supabase/functions/rentalsunited-api/index.ts` -- add `push_building`, `list_buildings` actions + `BuildingID` field in property XML
- `supabase/functions/push-property-to-ru/index.ts` -- multi-unit orchestration loop
- `src/components/property/PushToRentalsUnited.tsx` -- show building + per-unit status
- DB migration: add `rentalsunited_building_id` to `properties`, `rentalsunited_property_id` to `hostfully_room_types`

