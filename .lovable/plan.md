

# Fix Hostfully Calendar Data Display - Frontend Field Name Mapping

## Problem Identified

The calendar sync succeeds and the edge function correctly returns data following the **adapter contract**, but the **frontend code doesn't recognize the correct field names**.

### Root Cause

The adapter contract (`_shared/adapter-contract.ts`) defines:
```typescript
interface RoomTypeAvailability {
  name: string;                    // Room type name
  availability_per_night: [];      // Daily availability
  rate_types: [];                  // Rates
}
```

The Hostfully edge function correctly returns:
```json
{
  "room_type_id": "818e799c...",
  "name": "Full Property",
  "availability_per_night": [
    { "date": "2026-01-01", "available_units": 1, "restrictions": {...} }
  ],
  "rate_types": [
    { "rate_type_id": "standard", "name": "Standard Rate", "rates": [...] }
  ]
}
```

But the frontend code (`CalendarAccommodation.tsx` line 524) only checks for legacy field names:
```typescript
const availPerNight = roomType.rooms_available_per_night ?? roomType.roomsAvailablePerNight ?? [];
//                          ↑ Benson format              ↑ camelCase
//                          Missing: availability_per_night (adapter contract format)
```

## Solution

Update `CalendarAccommodation.tsx` to add `availability_per_night` as a fallback option when extracting availability data.

### Code Change

**File**: `src/pages/CalendarAccommodation.tsx`

**Line 524 (current):**
```typescript
const availPerNight = roomType.rooms_available_per_night ?? roomType.roomsAvailablePerNight ?? [];
```

**Line 524 (fixed):**
```typescript
const availPerNight = roomType.rooms_available_per_night ?? roomType.roomsAvailablePerNight ?? roomType.availability_per_night ?? [];
```

This adds the adapter contract field name (`availability_per_night`) as a fallback, maintaining backward compatibility with Benson's legacy format while supporting the new adapter contract.

## Technical Details

### Field Mapping After Fix

| Edge Function Returns | Frontend Extraction | Status |
|----------------------|---------------------|--------|
| `name` | Falls back to `name` on line 517 | Already works |
| `availability_per_night` | Will now match after fix | FIX REQUIRED |
| `rate_types` | Already matches | Already works |

### Why This Approach?

1. **Single-line change**: Minimal risk of side effects
2. **Backward compatible**: Keeps legacy Benson field names for existing integrations
3. **Follows adapter contract**: Now correctly handles the standardized format
4. **Defensive**: Falls back gracefully through multiple field names

### Data Flow After Fix

```text
Edge Function Response
        │
        ▼
┌──────────────────────────────────────────┐
│ {                                        │
│   "name": "Full Property",               │
│   "availability_per_night": [...]        │  ← Now matched!
│   "rate_types": [...]                    │
│ }                                        │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ Frontend extracts:                       │
│   roomType.availability_per_night ✓      │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ Calendar displays:                       │
│ - R450/night rates                       │
│ - Availability (1 unit)                  │
│ - Min stay: 2 nights                     │
└──────────────────────────────────────────┘
```

## Files Modified

| File | Change |
|------|--------|
| `src/pages/CalendarAccommodation.tsx` | Add `availability_per_night` to field extraction fallback chain |

## Expected Result

After this fix:
1. The "Full Property" row will populate with availability data
2. Rates (R450/night) will display in each cell
3. Restrictions (min stay 2 nights) will show
4. All other PMS integrations (Benson, etc.) continue to work unchanged

