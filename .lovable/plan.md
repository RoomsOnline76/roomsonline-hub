

# Plan: Fix Availability Display for Manual Properties

## Problem Summary

The calendar for "Latter Days" still shows **99 availability** instead of the correct value. The issue is a **field name mismatch**:

| Source | Field Name | Latter Days Value |
|--------|------------|-------------------|
| Onboarding Wizard | `units` | Not set |
| Property Form | `numRooms` | 3 |
| CalendarAccommodation | Checks only `units` | Falls back to 1 |

But the rendered value shows **99** because the code change isn't being applied correctly to the actual data path.

Looking at the database query result, "Latter Days" has:
- `numRooms: 3` (this is labelled "# Rooms" in PropertyForm, but represents bedrooms/rooms inside the unit)
- No `units` field at all
- The property is a single holiday house (1 bookable unit)

For a self-catering holiday house like "Latter Days", the entire house is 1 bookable unit (with 3 bedrooms inside). So availability should be **1**.

## Root Cause Analysis

1. **Field naming inconsistency**: 
   - Wizard uses `units` for bookable unit count
   - PropertyForm uses `numRooms` for both bedroom count AND unit count (confusing)
   - For "Latter Days", `numRooms: 3` represents 3 bedrooms, not 3 bookable units

2. **Missing "units" field**: 
   - The property was created before `units` field was standardized
   - Code falls back to `1` but still shows 99

3. **Potential caching issue**:
   - The code change may not be taking effect
   - The synthetic data generation might not be triggering

## Solution

Update `generateManualPropertyData` to:
1. Check for `units` first (wizard standard)
2. If not found, check if property type suggests single-unit booking (holiday house, villa, cottage)
3. For self-catering/villa/cottage types, default to 1 (entire property)
4. For hotels/B&Bs with `numRooms`, use that as unit count
5. Add console logging to debug why 99 is still appearing

## Technical Implementation

### CalendarAccommodation.tsx - Smarter Unit Detection

**Location**: `generateManualPropertyData` function (around line 685)

**Current code:**
```typescript
const roomUnits = room.units || 1;
```

**Updated code:**
```typescript
// Check multiple possible field names for unit count
// Wizard uses 'units', PropertyForm uses 'numRooms' for some properties
// For holiday houses/villas/cottages, the entire property is 1 bookable unit
const isWholePropertyType = ['self_catering', 'villa', 'cottage', 'holiday_house', 'house'].some(
  type => (room.pmsRoomType || room.name || '').toLowerCase().includes(type) ||
          (property.property_type || '').toLowerCase().includes(type)
);

// Priority: explicit units > infer from property type > fallback
let roomUnits = 1; // Default for single-unit properties
if (room.units !== undefined && room.units !== null) {
  roomUnits = room.units;
} else if (!isWholePropertyType && room.numRooms) {
  // For hotels/B&Bs, numRooms can represent bookable units
  roomUnits = room.numRooms;
}
// For whole-property types (holiday house, villa), always use 1

console.log('[Manual Calendar] Room units calculation:', {
  roomName: room.name,
  units: room.units,
  numRooms: room.numRooms,
  isWholePropertyType,
  calculatedUnits: roomUnits
});
```

This ensures:
- "3 Bedroomed Holiday House" → detected as whole-property type → 1 unit
- Hotels with 10 "Deluxe Rooms" → uses numRooms → 10 units
- Wizard-created rooms with explicit `units: 5` → uses that value

### Alternative Simpler Approach

If the property type detection is too complex, we could:

1. Check `units` field first
2. Then check for a new field `bookable_units` or `inventory_count`
3. Default to 1 for non-PMS properties (safer assumption)

**Simpler code:**
```typescript
// For manual properties, prefer explicit units field, default to 1 (single unit)
// numRooms represents bedrooms, not bookable units for holiday houses
const roomUnits = room.units ?? 1;
```

This is already what the code does, but the issue is that 99 is still showing, suggesting the `generateManualPropertyData` function might not be getting called.

### Debug: Verify Function Execution

Add logging at the start of `generateManualPropertyData`:

```typescript
const generateManualPropertyData = useCallback(async (property: any) => {
  console.log('[Manual Calendar] Generating synthetic data for:', property.name);
  console.log('[Manual Calendar] Room types:', property.amenities?.room_types);
  // ... rest of function
}, [currentDate, viewMode]);
```

This will help identify if:
- The function is being called at all
- What room data is being processed
- Why availability ends up as 99

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/CalendarAccommodation.tsx` | Add debug logging, use `room.units ?? 1` for unit count (not `||` which treats 0 as falsy) |

## Expected Result

| Before | After |
|--------|-------|
| Shows "99" available | Shows "1" available |
| All dates show unlimited inventory | Single-unit properties show 1 |

## Note on Data Migration

For existing properties like "Latter Days", the owner can update the `units` field in the Property Form or Onboarding Wizard to explicitly set the bookable unit count. This provides a proper long-term fix rather than relying on heuristics.

