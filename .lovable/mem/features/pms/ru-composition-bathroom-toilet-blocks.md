---
name: RU Composition Bathroom/Toilet Blocks
description: RU renders bathrooms/toilets from CompositionRoomsAmenities blocks, never from the root Amenities list
type: feature
---

Rentals United builds the public Composition panel (bedrooms / bathrooms / toilets) purely
from `CompositionRoomsAmenities` blocks — one block per room. Listing 81 (Bathroom) and 37
(toilet) in the root `<Amenities>` list is stored but never counted, which is why listings
published as "0 Bathroom / 0 Toilet".

Rules:
- Emit one `CompositionRoomID="81"` block per bathroom, one `CompositionRoomID="53"` (WC)
  block per toilet, and one `CompositionRoomID="101"` block when separate kitchen is true.
- Every block must carry a real child amenity. An empty `<Amenities/>` is parsed as amenity
  id 0 and rejected with "Wrong composition room id:0". Child is taken from the unit's own
  selection (bathroom fixtures / kitchen items), fallback 245 washbasin, 37 toilet, 101 kitchen.
- Bed counts (`NumberOfBeds`) must be measured from the Bedroom (257) blocks *before* the
  bathroom/WC/kitchen blocks are appended, otherwise they inflate the bed total.
- Implemented in `compositionRoomBlocks()` in `supabase/functions/push-property-to-ru/index.ts`,
  used by both the per-unit and single-listing payload builders.
- Verified 2026-08-20 by read-back of units 5655617 and 5763781 (owner_id 741765): each now
  returns one 81 block and one 53 block alongside the bedroom blocks.
