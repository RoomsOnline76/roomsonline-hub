

# Plan: Use Actual Room Units for Manual Property Availability

## Problem Summary

Currently, for non-PMS properties (like "Latter Days"), availability is hardcoded to **99 units** everywhere. This is incorrect because:

1. "Latter Days" has only **1 unit** of their room type (as configured in the wizard)
2. The calendar shows 99 available when it should show 1
3. When blocking dates, owners can't do partial blocks (e.g., block 1 of 3 units)
4. The booking page also shows unlimited availability

## Solution

1. Read the actual `units` value from `room_types` in the property's amenities (defaults to 1 if not set)
2. Use this as the default availability instead of 99
3. Update the Stop Sell dialog to support partial blocking (specify how many units to block)
4. Ensure availability decrements correctly when blocking

## Technical Implementation

### 1. CalendarAccommodation.tsx - Use Room Units

**Current code (line 688):**
```typescript
availabilityByDate[dateStr] = override?.available_units ?? 99;
```

**Updated logic:**
```typescript
// Get the room's actual unit count from wizard config
const roomUnits = room.units || 1;

// Use room units as default, respect overrides
availabilityByDate[dateStr] = override?.available_units ?? roomUnits;
```

This applies to the `generateManualPropertyData` function where synthetic PMS data is created.

### 2. RoomAvailabilityCalendar.tsx - Use Room Units

**Current code (line 246):**
```typescript
available_units: 99, // Unlimited availability for manual properties
```

**Updated logic:**
```typescript
// Get room's actual unit count
const roomUnits = matchedRoom?.units || 1;

availMap.set(dateStr, {
  date: dateStr,
  available_units: roomUnits, // Actual units, not unlimited
  rates: rateForDay ? [/* ... */] : undefined,
});
```

Also update the override merge logic to handle partial blocks.

### 3. Booking.tsx - Use Room Units

**Current code (line 628):**
```typescript
available_units: blockedDates.has(dateStr) ? 0 : 99,
```

**Updated logic:**
```typescript
// Find the room's actual units from wizard config
const roomConfig = roomTypes.find(rt => 
  rt.name === room.roomTypeName || rt.id === room.roomTypeId
);
const roomUnits = roomConfig?.units || 1;

// Use actual units, respect blocks
available_units: blockedDates.has(dateStr) ? 0 : roomUnits,
```

### 4. PropertyShowcase.tsx - Use Room Units

**Current code (line 283):**
```typescript
available_units: 99, // Unlimited availability for manual properties
```

**Updated logic:**
```typescript
available_units: room.units || 1, // Actual units from wizard
```

### 5. BulkStopSellDialog.tsx - Add Partial Blocking

Add a "Units to Block" input field for properties with multiple units:

**New state:**
```typescript
const [unitsToBlock, setUnitsToBlock] = useState<number | null>(null); // null = block all
```

**Pass room units info:**
```typescript
interface RoomTypeWithUnits {
  name: string;
  id?: string;
  units?: number;
}

// roomTypes prop now includes units
roomTypes?: RoomTypeWithUnits[];
```

**UI changes:**
- Add a number input: "Units to Block" (defaults to max units)
- Show current availability per room type
- Calculate `available_units = totalUnits - unitsToBlock` for the record

**Updated save logic:**
```typescript
const totalUnits = roomTypesMap.get(roomType)?.units || 1;
const remainingUnits = isStopSell 
  ? (totalUnits - (unitsToBlock ?? totalUnits)) // Partial block
  : totalUnits; // Full unblock

records.push({
  property_id: propertyId,
  room_type: roomType,
  date: format(date, "yyyy-MM-dd"),
  is_stop_sell: remainingUnits === 0,
  available_units: remainingUnits,
  external_system: 'manual',
});
```

## Data Flow

```text
Property wizard sets: room_types[0].units = 1

Calendar page loads for "Latter Days"
         ↓
generateManualPropertyData() reads units = 1
         ↓
Sets availabilityByDate[date] = 1 (not 99)
         ↓
Calendar shows "1" available per date

Owner opens Stop Sell dialog
         ↓
Selects "3 Bedroomed Holiday House" (units: 1)
         ↓
UI shows: "Block 1 of 1 unit" (no partial option for single unit)
         ↓
Saves with available_units = 0, is_stop_sell = true

For a property with 5 units of a room type:
         ↓
Owner opens Stop Sell dialog
         ↓
UI shows: "Units to block: [3]" (can choose 1-5)
         ↓
Saves with available_units = 2 (5 - 3), is_stop_sell = false
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/CalendarAccommodation.tsx` | Use `room.units` instead of 99 in synthetic data generation |
| `src/components/RoomAvailabilityCalendar.tsx` | Use `matchedRoom.units` instead of 99 for default availability |
| `src/pages/Booking.tsx` | Use room config `units` instead of 99 for synthetic availability |
| `src/pages/PropertyShowcase.tsx` | Use `room.units` instead of 99 in synthetic availability map |
| `src/components/BulkStopSellDialog.tsx` | Add units input, pass units in roomTypes prop, calculate partial blocks |

## Visual Changes

### Calendar View
| Before | After |
|--------|-------|
| Shows "99" available | Shows "1" available |
| All green cells | Same, but accurate count |

### Stop Sell Dialog (for multi-unit rooms)
| Before | After |
|--------|-------|
| Block/Unblock toggle only | Block/Unblock + "Units to block" input |
| Blocks all units | Can block 1, 2, etc. of N units |

## Edge Cases

1. **No units field defined**: Default to 1 (single unit)
2. **Block more than available**: Clamp to max units
3. **Existing override with partial block**: Merge correctly (override takes precedence)
4. **Unblock restores to full units**: Reset `available_units` to room's `units` value

