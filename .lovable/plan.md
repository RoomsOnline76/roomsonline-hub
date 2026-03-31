

# Accommodation Type System — Room/Unit/Chalet/Apartment Labels

## Problem

Every room across the system is generically called a "Room" or "Room Type". The only exception is Hostfully properties, which hardcode "unit/units". In reality, properties have diverse accommodation types — Self Catering Units, Chalets, Apartments, Suites, Cottages, Cabins, etc. The label should be configurable per property and flow through to the `/book` page, showcase, and PMS.

Additionally, "Self Catering" should be selectable as a property-level attribute (it's a service model, not just a room type).

## Current State

- `PropertyForm.tsx` line 5098–5104: Property type dropdown has Hotel, Guest House, B&B, Lodge, Resort, Villa, Apartment — missing Self Catering, Chalet, Cottage, Cabin, etc.
- `PropertyShowcase.tsx` line 445: `unitLabel` is hardcoded: `isHostfullyProperty ? 'unit' : 'room'` — no awareness of property type or accommodation type
- `RoomCollection.tsx` and `CategoryCollection.tsx`: Accept `unitLabel`/`unitLabelPlural` props — already support dynamic labels, just need correct values passed in
- `Booking.tsx`: Uses "Room Type" in UI labels (line 1890–1894) — hardcoded
- `rolos_room_types` table: No `accommodation_type` column
- `OnboardingRoomType` in `onboardingFieldSchema.ts`: No accommodation type field
- `PROPERTY_TYPES` already includes `self_catering` in the onboarding schema but it's not in the PropertyForm dropdown

## Design

### 1. Property-level accommodation label

Add `accommodation_label` to the `properties.amenities` JSONB (no migration needed). This defines how "rooms" are referred to for this property. Options:

| Value | Singular | Plural |
|-------|----------|--------|
| `room` | Room | Rooms |
| `unit` | Unit | Units |
| `apartment` | Apartment | Apartments |
| `chalet` | Chalet | Chalets |
| `cottage` | Cottage | Cottages |
| `cabin` | Cabin | Cabins |
| `suite` | Suite | Suites |
| `villa` | Villa | Villas |
| `studio` | Studio | Studios |
| `tent` | Tent | Tents |
| `pod` | Pod | Pods |

A helper function `getAccommodationLabel(property)` resolves the label with smart defaults based on `property_type` (e.g., `apartment` → "Apartment", `self_catering` → "Unit", `lodge` → "Room").

### 2. Expand property type dropdown

Add missing types to the PropertyForm dropdown: Self Catering, Chalet, Cottage, Cabin, Boutique Hotel, Game Lodge, Safari Lodge, Backpackers.

### 3. Self Catering as property-level flag

Add a "Self Catering" toggle to the amenities/Info & Facilities tab. This is distinct from property type — a Guest House can also offer self-catering units. Stored in `amenities.self_catering: boolean`.

### 4. Flow labels through to all consumer pages

- **PropertyShowcase.tsx**: Replace hardcoded Hostfully check with `getAccommodationLabel(property)` 
- **Booking.tsx**: Use the label for "Select room type" → "Select apartment" etc.
- **RoomCollection / CategoryCollection**: Already accept props — just pass correct values
- **Onboarding wizard**: Add accommodation label selector to StepRoomsOverview
- **PMS Room Types page**: Use the label in headings

## Technical Details

### Helper utility — `src/lib/accommodationLabels.ts`

```typescript
const ACCOMMODATION_TYPES = {
  room: { singular: 'Room', plural: 'Rooms' },
  unit: { singular: 'Unit', plural: 'Units' },
  apartment: { singular: 'Apartment', plural: 'Apartments' },
  chalet: { singular: 'Chalet', plural: 'Chalets' },
  cottage: { singular: 'Cottage', plural: 'Cottages' },
  cabin: { singular: 'Cabin', plural: 'Cabins' },
  suite: { singular: 'Suite', plural: 'Suites' },
  villa: { singular: 'Villa', plural: 'Villas' },
  studio: { singular: 'Studio', plural: 'Studios' },
  tent: { singular: 'Tent', plural: 'Tents' },
  pod: { singular: 'Pod', plural: 'Pods' },
};

function getAccommodationLabel(property): { singular: string; plural: string }
// Checks amenities.accommodation_label first, then infers from property_type + external_system
```

### Smart defaults by property_type
- `apartment` → Apartment
- `villa` → Villa  
- `self_catering` → Unit
- `lodge`, `hotel`, `bnb`, `guesthouse` → Room
- Hostfully properties → Unit (existing behavior preserved)

## Files

| Action | File |
|--------|------|
| Create | `src/lib/accommodationLabels.ts` — label types, resolution helper |
| Modify | `src/pages/PropertyForm.tsx` — expand property type dropdown, add accommodation label selector, add self-catering toggle |
| Modify | `src/pages/PropertyShowcase.tsx` — replace hardcoded Hostfully label with `getAccommodationLabel()` |
| Modify | `src/pages/Booking.tsx` — use dynamic label for "Room Type" references |
| Modify | `src/components/onboarding/steps/StepRoomsOverview.tsx` — add accommodation label selector |
| Modify | `src/pages/pms/PMSRoomTypes.tsx` — use dynamic label in headings |
| Modify | `src/config/onboardingFieldSchema.ts` — add accommodation_label to schema |

No database migration needed — uses existing `amenities` JSONB and `property_type` column.

