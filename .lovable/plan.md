

# Fix: Benson Checkout Room Matching Failure

## Problem
The checkout URL contains Benson-native identifiers (`roomTypeId=1431`, `roomTypeName=LUXURY SUITES`) but the orchestrator returns ROL'OS UUIDs and canonical names (e.g. `d6b2095f-...`, `BOSBOK`). The room alias matching logic in `Booking.tsx` cannot bridge this gap because:

1. `roomTypes.find(r => r.id === "1431")` returns nothing — no `roomDef` is found
2. Without `roomDef`, no additional aliases (name, hfRoom mappings) are added
3. The `linked_rolos_id` URL param (`a1c79c3e-...`) is read but never used for room resolution
4. Name fallback fails because `LUXURY SUITES` ≠ `BOSBOK`

## Fix — Two changes in `src/pages/Booking.tsx`

### 1. Use `linked_rolos_id` to resolve the real room UUID at initialization
In the room initialization block (~line 567), when `preSelectedRoomTypeId` is set and `embedLinkedRolosId` is also present, look up `hfRoomsRef` to find the canonical room UUID and use that instead of the Benson native ID.

### 2. Expand alias set in `calculateCost` to include `linked_rolos_id`
In the alias-building block (~line 897-909), add two additional resolution paths:
- If `embedLinkedRolosId` is set and matches a `hfRoom.linked_rolos_id`, add that hfRoom's UUID to the alias set
- Also try matching `hfRoomsRef` entries by `linked_rolos_id` (not just by `id` or `name`), so that `linked_rolos_id=a1c79c3e-...` → `hfRoom.id=d6b2095f-...` gets added as an alias

```text
Current alias set for roomTypeId=1431:
  { "1431" }  →  matches nothing

After fix:
  { "1431", "d6b2095f-...", "bosbok" }  →  matches orchestrator room
```

### 3. Fallback: resolve via `linked_rolos_id` in `hfRoomsRef` before name fallback
After the primary alias match fails (~line 930), before the name fallback, add a `linked_rolos_id` lookup: if `embedLinkedRolosId` is set, find the hfRoom with that `linked_rolos_id` and match by its UUID.

## Files changed

| File | Change |
|---|---|
| `src/pages/Booking.tsx` | Add `linked_rolos_id` to alias resolution in room initialization and cost calculation |

## What does NOT change
- Orchestrator / edge functions unchanged
- Database unchanged
- Other PMS adapters unaffected

