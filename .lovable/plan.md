
# Plan: Fix Calendar Restrictions, Unblock Logic, and Bulk Dialogs

## Problems Identified

### 1. Visual Color Coding Not Showing for Stop Sell (and other restrictions)
**Root Cause**: The `getRestrictions()` helper function only finds restrictions if the PMS room name matches. For manual properties, the room matching logic may fail because `restrictionsByDate` is populated in `generateManualPropertyData()` but `getRestrictions()` uses fuzzy name matching that doesn't find the room correctly.

**Current code (lines 1384-1400)**:
```typescript
const getRestrictions = (roomName: string, date: Date) => {
  if (pmsData.roomTypes.length > 0) {
    const pmsRoom = pmsData.roomTypes.find(rt => 
      rt.roomTypeName.toLowerCase().includes(roomName.toLowerCase()) ||
      roomName.toLowerCase().includes(rt.roomTypeName.toLowerCase())
    );
    
    if (pmsRoom && pmsRoom.restrictionsByDate[dateStr]) {
      // Returns restrictions...
    }
  }
  
  // Returns null if no match - restrictions don't show!
  return { stopSell: null, minStay: null, ... };
}
```

**Issue**: If the room name passed to `getRestrictions()` doesn't fuzzy-match, restrictions return as `null` and no color bars appear.

### 2. Unblocking Blocked Dates Corrupts Availability and Rates
**Root Cause**: In `BulkStopSellDialog.tsx` (line 135), when unblocking:
```typescript
available_units: isStopSell ? 0 : 99, // 0 if blocking, 99 if unblocking
```

This hardcodes availability to `99` when unblocking, which:
- Overwrites the correct room unit count (should be 1 for holiday houses)
- Doesn't preserve any rate information that was set

### 3. Bulk Availability Dialog Shows Wrong Room Types
**Root Cause**: All bulk dialogs (except `BulkStopSellDialog`) have **hardcoded room types** instead of receiving them as props from the parent:

```typescript
// BulkAvailabilityRuleDialog.tsx (lines 65-86)
const roomTypes = [
  { id: "holidayHouse", name: "Holiday House", count: 9 },
  { id: "oneBedroom", name: "One Bedroom Suite", count: 14 },
  { id: "petiteHotel", name: "Petite Hotel Room", count: 14 },
  { id: "twoBedroom", name: "Two Bedroom Suite", count: 6 },
];
```

These are placeholder/demo values, not the actual property's room types.

### 4. Bulk Restriction Dialogs Don't Honor Property Setup
**Root Cause**: Same as issue 3 - `BulkMinimumStayDialog`, `BulkMaximumStayDialog`, `BulkLeadDaysAdvanceDialog`, `BulkLeadDaysPostDialog`, and `BulkRateRuleDialog` all have hardcoded room types instead of receiving property-specific data.

---

## Technical Implementation

### Fix 1: Calendar Restrictions - Improve Room Matching in `getRestrictions()`

**File**: `src/pages/CalendarAccommodation.tsx`

**Changes**:
- Make the room matching more robust by using exact match first, then fuzzy match
- Add fallback to check by room ID as well as name

```typescript
const getRestrictions = (roomName: string, date: Date) => {
  const dateStr = format(date, "yyyy-MM-dd");
  
  if (pmsData.roomTypes.length > 0) {
    // Try exact match first
    let pmsRoom = pmsData.roomTypes.find(rt => rt.roomTypeName === roomName);
    
    // Fallback to fuzzy match
    if (!pmsRoom) {
      pmsRoom = pmsData.roomTypes.find(rt => 
        rt.roomTypeName.toLowerCase().includes(roomName.toLowerCase()) ||
        roomName.toLowerCase().includes(rt.roomTypeName.toLowerCase())
      );
    }
    
    if (pmsRoom && pmsRoom.restrictionsByDate[dateStr]) {
      const r = pmsRoom.restrictionsByDate[dateStr];
      return {
        stopSell: r.stopSell ?? null,
        minStay: r.minStay ?? null,
        maxStay: r.maxStay ?? null,
        leadDaysAdvance: r.leadDaysAdvance ?? null,
        leadDaysPost: r.leadDaysPost ?? null,
        fromPms: true,
      };
    }
  }
  
  return {
    stopSell: null,
    minStay: null,
    maxStay: null,
    leadDaysAdvance: null,
    leadDaysPost: null,
    fromPms: false,
  };
};
```

### Fix 2: Unblocking Logic - Use Actual Room Units

**File**: `src/components/BulkStopSellDialog.tsx`

**Changes**:
1. Update interface to include `units` in room types
2. When unblocking, use the room's actual `units` value instead of hardcoded `99`
3. Optionally delete the override record instead of setting `available_units: 99` (cleaner approach)

**Updated Interface**:
```typescript
interface BulkStopSellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  propertyName?: string;
  roomTypes?: { name: string; id?: string; units?: number }[]; // Add units
  onRuleCreated?: () => void;
}
```

**Updated Logic**:
```typescript
// Create records for each room type and date
const records = [];
for (const roomType of selectedRoomTypes) {
  // Find the room's actual units
  const roomConfig = roomTypes.find(r => r.name === roomType);
  const roomUnits = roomConfig?.units || 1;
  
  for (const date of filteredDates) {
    if (isStopSell) {
      // Blocking: set available_units to 0
      records.push({
        property_id: propertyId,
        room_type: roomType,
        date: format(date, "yyyy-MM-dd"),
        is_stop_sell: true,
        available_units: 0,
        external_system: 'manual',
      });
    } else {
      // Unblocking: DELETE the override instead of setting to 99
      // This allows the default room units to be used
    }
  }
}

// For unblocking, delete the records instead
if (!isStopSell) {
  const { error } = await supabase
    .from("property_availability")
    .delete()
    .eq("property_id", propertyId)
    .in("room_type", selectedRoomTypes)
    .gte("date", fromDate)
    .lte("date", toDate);
  
  if (error) throw error;
} else {
  // For blocking, upsert as before
  const { error } = await supabase
    .from("property_availability")
    .upsert(records, { 
      onConflict: 'property_id,room_type,date',
      ignoreDuplicates: false 
    });
  
  if (error) throw error;
}
```

### Fix 3: Update CalendarAccommodation to Pass Room Units

**File**: `src/pages/CalendarAccommodation.tsx`

**Changes**: Update the `roomTypes` prop passed to `BulkStopSellDialog` to include `units`:

```typescript
<BulkStopSellDialog 
  open={stopSellOpen} 
  onOpenChange={setStopSellOpen}
  propertyId={selectedProperty}
  propertyName={selectedPropertyData?.name}
  roomTypes={calendarRoomData.map(r => ({ 
    name: r.name, 
    id: r.pmsRoomTypeId,
    units: r.units || 1  // Include units
  }))}
  onRuleCreated={() => {
    if (!isPmsProperty) {
      fetchRoomTypes(selectedProperty);
    }
  }}
/>
```

Also need to ensure `calendarRoomData` includes `units` - check the mapping logic.

### Fix 4: Update All Bulk Dialogs to Accept Property-Specific Room Types

**Files to update**:
- `src/components/BulkAvailabilityRuleDialog.tsx`
- `src/components/BulkMinimumStayDialog.tsx`
- `src/components/BulkMaximumStayDialog.tsx`
- `src/components/BulkLeadDaysAdvanceDialog.tsx`
- `src/components/BulkLeadDaysPostDialog.tsx`
- `src/components/BulkRateRuleDialog.tsx`

**For each dialog**:
1. Add props interface to accept room types from parent
2. Remove hardcoded `roomTypes` array
3. Use the passed-in room types for display and operations

**Example for BulkAvailabilityRuleDialog**:
```typescript
interface BulkAvailabilityRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  propertyName?: string;
  roomTypes?: { name: string; id?: string; units?: number }[];
  onRuleCreated?: () => void;
}

export function BulkAvailabilityRuleDialog({ 
  open, 
  onOpenChange,
  propertyId,
  propertyName,
  roomTypes = [],
  onRuleCreated
}: BulkAvailabilityRuleDialogProps) {
  // Remove hardcoded roomTypes const
  // Use props roomTypes instead
}
```

### Fix 5: Update CalendarAccommodation to Pass Props to All Dialogs

**File**: `src/pages/CalendarAccommodation.tsx`

Update all dialog invocations to pass the required props:

```typescript
<BulkAvailabilityRuleDialog 
  open={bulkAvailabilityOpen} 
  onOpenChange={setBulkAvailabilityOpen}
  propertyId={selectedProperty}
  propertyName={selectedPropertyData?.name}
  roomTypes={calendarRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId, units: r.units || 1 }))}
  onRuleCreated={() => fetchRoomTypes(selectedProperty)}
/>

<BulkMinimumStayDialog 
  open={minStayOpen} 
  onOpenChange={setMinStayOpen}
  propertyId={selectedProperty}
  propertyName={selectedPropertyData?.name}
  roomTypes={calendarRoomData.map(r => ({ name: r.name, id: r.pmsRoomTypeId }))}
  onRuleCreated={() => fetchRoomTypes(selectedProperty)}
/>

// Same pattern for MaxStay, LeadDaysAdvance, LeadDaysPost, RateRule dialogs
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/CalendarAccommodation.tsx` | Improve `getRestrictions()` matching; pass room types to all bulk dialogs |
| `src/components/BulkStopSellDialog.tsx` | Fix unblock logic to delete overrides; add `units` to interface |
| `src/components/BulkAvailabilityRuleDialog.tsx` | Accept room types as props; remove hardcoded data |
| `src/components/BulkMinimumStayDialog.tsx` | Accept room types as props; implement database save |
| `src/components/BulkMaximumStayDialog.tsx` | Accept room types as props; implement database save |
| `src/components/BulkLeadDaysAdvanceDialog.tsx` | Accept room types as props; implement database save |
| `src/components/BulkLeadDaysPostDialog.tsx` | Accept room types as props; implement database save |
| `src/components/BulkRateRuleDialog.tsx` | Accept room types as props; remove hardcoded data |

---

## Expected Results

| Issue | Before | After |
|-------|--------|-------|
| Stop sell color indicator | Not showing on calendar | Red bar appears for blocked dates |
| Min stay indicator | Not showing | Blue bar with number appears |
| Unblocking dates | Sets availability to 99, corrupts data | Deletes override, restores room's default units |
| Bulk Availability room types | Shows "Holiday House, One Bedroom Suite..." (hardcoded) | Shows actual property room types (e.g., "3 Bedroomed Holiday House") |
| Other bulk dialogs | All show hardcoded room types | All show actual property room types |

---

## Data Flow After Fix

```text
Owner opens Bulk Stop Sell for "Latter Days"
         ↓
Dialog receives roomTypes=[{ name: "3 Bedroomed Holiday House", units: 1 }]
         ↓
Owner selects room, date range, clicks "Block"
         ↓
Saves: available_units=0, is_stop_sell=true
         ↓
Calendar refreshes → getRestrictions() finds exact room match
         ↓
Red stop sell bar appears on blocked dates

Owner later clicks "Unblock"
         ↓
DELETE FROM property_availability WHERE room_type=... AND date BETWEEN ...
         ↓
Override removed → generateManualPropertyData() uses default units (1)
         ↓
Calendar shows "1" available, no corruption
```
