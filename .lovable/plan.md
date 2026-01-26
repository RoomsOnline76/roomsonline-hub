

# Fix Hostfully Calendar Rates Display - Rate Type ID Mismatch

## Problem Identified

The calendar shows availability but no rates because of a rate type ID mismatch and missing rate type configuration.

### Root Cause Analysis

| Source | Rate Type ID | Status |
|--------|-------------|--------|
| Edge function `rate_types[0].rate_type_id` | `"standard"` | Returned in API response |
| Property's `amenities.room_types[0].linkedRateTypeIds` | `["per-unit"]` | Set during ingestion |
| Property's `amenities.pms_rate_types` | `[]` (empty) | No rate types configured |

The frontend uses `pms_rate_types` to populate the "Rate Types" dropdown (line 887-919). Since it's empty:
1. `rateTypeOptions` is empty
2. `selectedRateTypes` stays empty
3. No rates are rendered in the UI

Additionally, even if `pms_rate_types` was populated, the ID mismatch between "standard" and "per-unit" would prevent matching.

### Data Flow Issue

```text
Edge Function Response            Frontend Rate Type Filtering
┌────────────────────────┐        ┌────────────────────────────────────────┐
│ rate_types: [{         │        │ rateTypeOptions built from:            │
│   rate_type_id:        │        │   selectedPropertyData.amenities       │
│     "standard" ←───────┼────┐   │     .pms_rate_types = [] (EMPTY!)      │
│ }]                     │    │   │                                        │
└────────────────────────┘    │   │ Since empty:                           │
                              │   │   selectedRateTypes = []               │
                              └──▶│   filteredRates = room.rates.filter(   │
                                  │     rate => [].includes("standard")    │
                                  │   ) = [] (NO MATCH!)                   │
                                  └────────────────────────────────────────┘
```

## Solution

Two-part fix to ensure rate type IDs are consistent and configured:

### Part 1: Edge Function - Use Consistent Rate Type ID

Update `mapHostfullyCalendarToAvailability` to use `"per-unit"` instead of `"standard"` to match the ingestion pipeline.

**File**: `supabase/functions/hostfully-api/index.ts`

**Current (lines 402-414):**
```typescript
rate_types: [{
  rate_type_id: "standard",
  name: "Standard Rate",
  price_type: "per_night",
  ...
}]
```

**Fixed:**
```typescript
rate_types: [{
  rate_type_id: "per-unit",
  name: "Per Unit Rate",
  price_type: "per_night",
  ...
}]
```

### Part 2: Edge Function - Populate pms_rate_types During Ingestion

Ensure the full ingestion pipeline writes the rate type to `amenities.pms_rate_types` so the frontend can discover it. This should already exist in the ingestion logic but may need verification.

Alternatively, the frontend can be updated to also build `rateTypeOptions` from PMS response data when `pms_rate_types` is empty.

### Part 3: Frontend Fallback - Build Rate Types from PMS Data

Update `rateTypeOptions` memoization to also check PMS response data when property's `pms_rate_types` is empty.

**File**: `src/pages/CalendarAccommodation.tsx`

**Enhanced logic (after line 920):**
```typescript
// Fallback: if no saved pms_rate_types, build from PMS data
if (rateTypes.length === 0 && pmsData.roomTypes.length > 0) {
  const seenRateTypes = new Set<string>();
  pmsData.roomTypes.forEach(room => {
    Object.values(room.ratesByDate).forEach(dateRates => {
      dateRates.forEach(rate => {
        if (rate.rateTypeId && !seenRateTypes.has(rate.rateTypeId)) {
          seenRateTypes.add(rate.rateTypeId);
          rateTypes.push({
            id: rate.rateTypeId,
            label: rate.rateTypeName || `Rate ${rate.rateTypeId}`,
            hasRates: true,
          });
        }
      });
    });
  });
}
```

## Technical Details

### Why Both Fixes?

1. **Edge function fix**: Ensures consistency between calendar responses and ingestion data
2. **Frontend fix**: Provides resilience when `pms_rate_types` is empty (common for new imports or sandbox properties)

### Data Flow After Fix

```text
Edge Function Response            Frontend Rate Type Filtering
┌────────────────────────┐        ┌────────────────────────────────────────┐
│ rate_types: [{         │        │ rateTypeOptions built from:            │
│   rate_type_id:        │        │   1. pms_rate_types (if populated)     │
│     "per-unit" ←───────┼────┐   │   2. FALLBACK: PMS response data       │
│ }]                     │    │   │                                        │
└────────────────────────┘    │   │ rateTypeOptions = [{ id: "per-unit" }] │
                              │   │ selectedRateTypes = ["per-unit"]       │
                              └──▶│ filteredRates matches "per-unit" ✓     │
                                  └────────────────────────────────────────┘
                                              │
                                              ▼
                                  ┌────────────────────────────────────────┐
                                  │ Calendar displays:                     │
                                  │   - R450/night in each cell            │
                                  │   - Min stay 2 nights                  │
                                  └────────────────────────────────────────┘
```

## Files Modified

| File | Change |
|------|--------|
| `supabase/functions/hostfully-api/index.ts` | Change rate_type_id from "standard" to "per-unit" |
| `src/pages/CalendarAccommodation.tsx` | Add fallback to build rateTypeOptions from PMS data when pms_rate_types is empty |

## Expected Result

After these fixes:
1. Rate Types dropdown shows "Per Unit Rate" option
2. Rate type is auto-selected (since it has data)
3. R450/night rates display in calendar cells
4. Backward compatible with existing Benson and other PMS integrations

