
# Fix Consistent Rate Calculation Failures Across PMS Properties

## Problem Summary

The booking page crashes with `Cannot read properties of undefined (reading 'rates')` when the rate type lookup fails. This affects:
- **Hostfully properties**: API returns `rate_type_id: "per-unit"` but `selectedRateType` may be mismatched
- **Latter Days / cache properties**: Similar ID mismatch between local room IDs and cache slugified IDs
- **HotelBeds properties**: Same structural issue

The crash occurs at line 548 in Booking.tsx where `rateType.rates` is accessed without checking if `rateType` exists.

---

## Root Causes

1. **Missing null check**: Line 548 accesses `rateType.rates` without verifying `rateType` exists
2. **Rate type mismatch**: `selectedRateType` may be "default" while API returns "per-unit"
3. **Race condition**: `calculateCost` can run before `cachedRateTypes` query completes, leaving `rateTypes` empty and setting `selectedRateType` to "default"

---

## Technical Section

### File Changes: `src/pages/Booking.tsx`

```text
1. Add safety check before accessing rateType.rates (line 548)
   - If rateType is undefined, try fallback to first available rate type
   - If still undefined, skip this room with a warning

2. Improve rate type matching logic (lines 541-546)
   - First try exact match with selectedRateType
   - Then try matching "default" or "per-unit" as synonyms
   - Fallback to first available rate type if no match

3. Add debug logging for rate type matching
   - Log selectedRateType value
   - Log available rate types in the array
   - Log match result
```

### Implementation Details

**Current unsafe code (lines 541-549):**
```typescript
const rateType = rateTypesArray.find(
  (rt: any) => {
    const rtId = String(rt.rate_type_id || rt.rateTypeId);
    return rtId === selectedRateType || rtId === 'default';
  }
);

const allRates = rateType.rates || []; // CRASHES if rateType undefined
```

**Fixed safe code:**
```typescript
// First try exact match, then flexible fallbacks
let rateType = rateTypesArray.find((rt: any) => {
  const rtId = String(rt.rate_type_id || rt.rateTypeId);
  return rtId === selectedRateType;
});

// Fallback 1: Try 'default' or 'per-unit' as universal rate types
if (!rateType) {
  rateType = rateTypesArray.find((rt: any) => {
    const rtId = String(rt.rate_type_id || rt.rateTypeId);
    return rtId === 'default' || rtId === 'per-unit';
  });
}

// Fallback 2: Use first available rate type
if (!rateType && rateTypesArray.length > 0) {
  console.warn('[Booking] Using first available rate type as fallback');
  rateType = rateTypesArray[0];
}

// Safety check before accessing rates
if (!rateType) {
  console.warn('[Booking] No rate type found for room:', room.roomTypeName);
  continue;
}

const allRates = rateType.rates || [];
```

---

## Implementation Steps

1. **Add null safety for rateType**
   - Add explicit check before accessing `rateType.rates`
   - Skip room calculation with warning if no rate type found

2. **Add flexible rate type matching fallbacks**
   - Try exact match with `selectedRateType` first
   - Fall back to universal types: `'default'`, `'per-unit'`
   - Last resort: use first rate type in array

3. **Add debug logging**
   - Log `selectedRateType` value
   - Log available rate type IDs
   - Log which fallback was used (if any)

---

## Testing Checklist

After implementation:
1. Navigate to Hostfully property (Victorian House), select dates, proceed to booking
2. Verify cost breakdown appears with correct ZAR pricing
3. Navigate to Latter Days property, select dates, proceed to booking
4. Verify cost breakdown appears without errors
5. Navigate to HotelBeds property, select dates, proceed to booking
6. Verify cost breakdown appears with correct EUR pricing
7. Complete a test booking on each property type to confirm full flow works
