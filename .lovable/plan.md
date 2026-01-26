

# Fix Hostfully Calendar Sync - Correct API v3 Response Structure

## Problem Identified

The logs show the **actual** Hostfully API v3 response format is different from what was assumed:

```json
{
  "calendar": {
    "entries": [
      {
        "date": "2026-01-01",
        "pricing": { "currency": "ZAR", "value": 450 },
        "availability": { 
          "unavailable": false, 
          "unavailabilityReason": null,
          "availableForCheckIn": true,
          "availableForCheckOut": true,
          "minimumStayLength": 2,
          "maximumStayLength": 0
        }
      }
    ]
  }
}
```

### Current Issues

1. **Wrong array extraction path**: Code uses `responseData.calendar` but the array is at `responseData.calendar.entries`
2. **Wrong field names in mapper**: The mapper expects flat fields like `price`, `available`, but API returns nested objects like `pricing.value`, `availability.unavailable`

## Solution

### Part 1: Fix Array Extraction

Update `handleFetchAvailability` to extract from the correct path:

**Current Code (line 807):**
```typescript
const calendarArray = responseData?.calendar || responseData?.days || responseData;
```

**Fixed Code:**
```typescript
const calendarArray = responseData?.calendar?.entries || 
                      responseData?.calendar || 
                      responseData?.days || 
                      responseData;
```

### Part 2: Update Interface and Mapper

Update the `HostfullyCalendarDay` interface and mapper to handle the v3 nested structure:

**Current Interface (lines 351-358):**
```typescript
interface HostfullyCalendarDay {
  date: string;
  available: boolean;
  price?: number;
  minimumStay?: number;
  checkInAllowed?: boolean;
  checkOutAllowed?: boolean;
}
```

**Fixed Interface:**
```typescript
interface HostfullyCalendarDay {
  date: string;
  note?: string | null;
  pricing?: {
    currency: string;
    value: number;
  };
  availability?: {
    unavailable: boolean;
    unavailabilityReason?: string | null;
    availableForCheckIn: boolean;
    availableForCheckOut: boolean;
    minimumStayLength: number;
    maximumStayLength: number;
  };
  // Legacy flat format support
  available?: boolean;
  price?: number;
  minimumStay?: number;
  checkInAllowed?: boolean;
  checkOutAllowed?: boolean;
}
```

**Current Mapper (lines 360-384):**
```typescript
function mapHostfullyCalendarToAvailability(calendarData: HostfullyCalendarDay[], propertyUid: string) {
  const roomType = {
    room_type_id: propertyUid,
    name: "Property",
    availability_per_night: calendarData.map(day => ({
      date: day.date,
      available_units: day.available ? 1 : 0,
      restrictions: {
        stop_sell: !day.available,
        min_stay: day.minimumStay || 1,
        // ...
      },
    })),
    rate_types: [{
      // ...
      rates: calendarData.filter(d => d.price).map(day => ({
        date: day.date,
        room_amount: day.price || 0,
        // ...
      })),
    }],
  };
}
```

**Fixed Mapper:**
```typescript
function mapHostfullyCalendarToAvailability(calendarData: HostfullyCalendarDay[], propertyUid: string) {
  const roomType = {
    room_type_id: propertyUid,
    name: "Property",
    availability_per_night: calendarData.map(day => {
      // Handle both v3 nested format and legacy flat format
      const isAvailable = day.availability 
        ? !day.availability.unavailable 
        : day.available ?? true;
      const minStay = day.availability?.minimumStayLength || day.minimumStay || 1;
      const checkInAllowed = day.availability?.availableForCheckIn ?? day.checkInAllowed ?? true;
      const checkOutAllowed = day.availability?.availableForCheckOut ?? day.checkOutAllowed ?? true;
      
      return {
        date: day.date,
        available_units: isAvailable ? 1 : 0,
        restrictions: {
          stop_sell: !isAvailable,
          min_stay: minStay,
          max_stay: day.availability?.maximumStayLength || null,
          closed_to_arrival: !checkInAllowed,
          closed_to_departure: !checkOutAllowed,
        },
      };
    }),
    rate_types: [{
      rate_type_id: "standard",
      name: "Standard Rate",
      price_type: "per_night",
      currency: calendarData[0]?.pricing?.currency || "ZAR",
      rates: calendarData
        .filter(d => d.pricing?.value || d.price)
        .map(day => ({
          date: day.date,
          room_amount: day.pricing?.value || day.price || 0,
          adult_amounts: [],
        })),
    }],
  };
  
  return { room_types: [roomType] };
}
```

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/index.ts` | Fix array extraction path and update mapper for v3 format |

## API Response Mapping

| Hostfully v3 Field | Mapped To |
|-------------------|-----------|
| `calendar.entries` | Calendar array |
| `entries[].date` | `date` |
| `entries[].pricing.value` | `room_amount` |
| `entries[].pricing.currency` | `currency` |
| `entries[].availability.unavailable` | `stop_sell` (inverted) |
| `entries[].availability.minimumStayLength` | `min_stay` |
| `entries[].availability.availableForCheckIn` | `closed_to_arrival` (inverted) |
| `entries[].availability.availableForCheckOut` | `closed_to_departure` (inverted) |

## Data Flow After Fix

```text
Hostfully API Response
        │
        ▼
┌──────────────────────────────────────────┐
│ { "calendar": { "entries": [...] } }     │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ Extract: responseData.calendar.entries   │
│ Result: Array of calendar entries        │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ Map v3 fields:                           │
│ pricing.value → room_amount              │
│ availability.unavailable → stop_sell     │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ SUCCESS! Calendar displays:              │
│ - ZAR 450/night rates                    │
│ - Availability status                    │
│ - Min stay restrictions                  │
└──────────────────────────────────────────┘
```

## Expected Result

After this fix:
1. The calendar will correctly extract the `entries` array from the v3 response
2. Rates will display correctly (R450/night as shown in logs)
3. Availability and restrictions will map properly
4. The Victorian House calendar will populate with data

