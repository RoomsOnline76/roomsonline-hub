
# Fix Hostfully Calendar Sync - Extract Calendar Array from API Response

## Problem Identified

The calendar sync is failing with:
```
TypeError: calendarData.map is not a function
```

### Root Cause

The Hostfully `/property-calendar/{propertyUid}` endpoint returns a **wrapper object**, not a direct array:

```json
{
  "calendar": [
    { "date": "2026-01-26", "available": true, "price": 150.00, ... },
    { "date": "2026-01-27", "available": false, ... }
  ]
}
```

But the current code passes the entire response object to the mapper:

```typescript
// Current code (line 801-802)
const calendarData = await response.json();  // Returns { calendar: [...] }
const availability = mapHostfullyCalendarToAvailability(calendarData, propertyUid);  // FAILS - calendarData is object, not array
```

The `mapHostfullyCalendarToAvailability` function expects an array and calls `.map()` on it:

```typescript
function mapHostfullyCalendarToAvailability(calendarData: HostfullyCalendarDay[], propertyUid: string) {
  const roomType = {
    availability_per_night: calendarData.map(day => ({ ... }))  // TypeError: calendarData.map is not a function
  };
}
```

## Solution

Update `handleFetchAvailability` in `supabase/functions/hostfully-api/index.ts` to extract the `calendar` array from the response object before passing it to the mapper.

### Code Change

**File**: `supabase/functions/hostfully-api/index.ts`

**Lines 800-803 (current):**
```typescript
const calendarData = await response.json();
const availability = mapHostfullyCalendarToAvailability(calendarData, propertyUid);
```

**Lines 800-812 (fixed):**
```typescript
const responseData = await response.json();

// Log the response structure for debugging
console.log("[Hostfully] Calendar response structure:", JSON.stringify(responseData).substring(0, 200));

// Extract calendar array - handle both wrapped and direct array formats
const calendarArray = responseData?.calendar || responseData?.days || responseData;

// Validate we have an array
if (!Array.isArray(calendarArray)) {
  console.error("[Hostfully] Calendar data is not an array:", typeof calendarArray);
  return createErrorResponse(
    ERROR_CODES.INVALID_REQUEST,
    "Invalid calendar data format from Hostfully API",
    "fetch_availability"
  );
}

const availability = mapHostfullyCalendarToAvailability(calendarArray, propertyUid);
```

## Technical Details

### Expected API Response Format

Based on Hostfully API documentation, the `/property-calendar` endpoint returns:

| Field | Type | Description |
|-------|------|-------------|
| `calendar` | Array | Array of daily availability objects |
| `calendar[].date` | string | Date in YYYY-MM-DD format |
| `calendar[].available` | boolean | Whether the date is available |
| `calendar[].price` | number | Nightly rate for this date |
| `calendar[].minimumStay` | number | Minimum stay requirement |
| `calendar[].checkInAllowed` | boolean | Can check in on this date |
| `calendar[].checkOutAllowed` | boolean | Can check out on this date |

### Defensive Approach

The fix handles multiple possible response formats:
1. `{ calendar: [...] }` - Standard Hostfully format
2. `{ days: [...] }` - Alternative field name (defensive)
3. Direct array `[...]` - In case API changes

### Error Logging

Added debug logging to capture the actual response structure, making future debugging easier.

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/index.ts` | Extract `calendar` array from API response object before mapping |

## Data Flow After Fix

```text
Calendar Sync Request
        │
        ▼
┌──────────────────────────────────────────┐
│ GET /property-calendar/{uid}             │
│ Returns: { "calendar": [...] }           │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ Extract: responseData.calendar           │
│ Result: Array of HostfullyCalendarDay    │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ mapHostfullyCalendarToAvailability(      │
│   calendarArray, propertyUid             │
│ )                                        │
└──────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ SUCCESS! Calendar displays rates         │
│ and availability                         │
└──────────────────────────────────────────┘
```

## Expected Result

After this fix:
1. The Hostfully calendar sync will correctly parse the API response
2. Rates and availability will load into the calendar view
3. The Victorian House property calendar will display availability data
