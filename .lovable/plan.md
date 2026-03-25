

# Fix: Room Types Not Showing in Charge Editor

## Problem
The Charge Editor fetches room types only from the `rolos_room_types` table, but most properties store their room types in `amenities.room_types` JSON or `hostfully_room_types`. The "SIX ON N" property has 4 room types in amenities but 0 in `rolos_room_types`, so the editor shows "No room types configured."

## Solution
Update the `ChargeEditor.tsx` room types query to use a **fallback chain**: first try `rolos_room_types`, then `hostfully_room_types`, then extract from `properties.amenities.room_types` JSON.

## Changes

### Modify `src/components/charges/ChargeEditor.tsx`
Update the `useQuery` for room types to:
1. Query `rolos_room_types` (current behavior)
2. If empty, query `hostfully_room_types` for the property
3. If still empty, query `properties.amenities` and extract `room_types` array, mapping each entry to `{ id, name }`

This mirrors the same fallback logic used in `PMSRoomTypes.tsx`'s `syncFromOverview`. The returned shape stays `{ id: string; name: string }[]` so nothing else changes.

### Single file change — no DB migration needed

