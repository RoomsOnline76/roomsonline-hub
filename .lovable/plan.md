

# Better Room Labels on Charges + Smart Copy Across Properties

## Two Problems

1. **Room badge is opaque** — shows "3 Rooms" but not *which* rooms. You have to open the editor to find out.
2. **Copy breaks room assignments** — `room_type_ids` are UUIDs specific to the source property. When copied to another property, those UUIDs don't exist, so room-specific charges silently apply to nothing.

## Changes

### 1. Show room names in charge list (`AdditionalChargesManager.tsx`)
- Fetch room types for the property using the same fallback chain (rolos → hostfully → amenities) already used in ChargeEditor
- Extract this into a shared hook: `usePropertyRoomTypes(propertyId)`
- In the charges table, replace the generic "3 Rooms" badge with actual room names as small badges (e.g., `Studio`, `Two bedroom`, `One bedroom`). If more than 3 rooms, show first 2 + "+1 more" tooltip.

### 2. New shared hook: `src/hooks/usePropertyRoomTypes.ts`
Extract the room-type fallback query from `ChargeEditor.tsx` into a reusable hook so both `AdditionalChargesManager` and `ChargeEditor` use the same logic. Returns `{ id, name }[]`.

### 3. Smart copy with room name matching (`usePropertyCharges.tsx`)
When copying charges to target properties:
- Fetch the target property's room types (using the same fallback chain)
- For each charge that has `applies_to_all_rooms = false`:
  - Match source room type **names** to target room type **names** (case-insensitive)
  - Remap `room_type_ids` to target UUIDs for matched rooms
  - Remap `room_charge_overrides` keys similarly
  - If some source rooms have no match in the target, still copy the charge with only the matched rooms
  - If zero rooms match, set `applies_to_all_rooms = true` as a safe fallback and add a toast warning
- Fetch source room types once before the loop, target room types per property

### 4. Update `CopyChargesModal.tsx` — Show mapping info
Add a small info note when room-specific charges exist: "Room-specific charges will be matched by name. Unmatched rooms will default to all rooms."

## No DB migration needed

