

# Fix Hostfully Booking Total Calculation

## Problem

The Booking page shows "On request" instead of the calculated price for Hostfully properties. The cost calculation is failing because:

1. Hostfully returns `price_type: "per_night"` in the API response
2. The `calculateCost()` function in Booking.tsx only checks for `'PER ROOM'`, `'PERROOM'`, or `'UNITRATE'` for per-room pricing
3. `"per_night".toUpperCase()` = `"PER_NIGHT"` - which doesn't match any condition
4. The code falls through to per-person pricing, which fails because Hostfully only has `room_amount`, not adult amounts

## Solution

Add `'PER_NIGHT'` and `'PER NIGHT'` to the price type check in `Booking.tsx`:

## Changes Required

| File | Change |
|------|--------|
| `src/pages/Booking.tsx` | Line 477: Add `'PER_NIGHT'` and `'PER NIGHT'` to the priceType condition |

## Code Change

**Current code (line 477):**
```typescript
if (priceType === 'PER ROOM' || priceType === 'PERROOM' || priceType === 'UNITRATE') {
```

**Fixed code:**
```typescript
if (priceType === 'PER ROOM' || priceType === 'PERROOM' || priceType === 'UNITRATE' || priceType === 'PER_NIGHT' || priceType === 'PER NIGHT') {
```

This single-line fix will allow Hostfully's per-night pricing to be correctly processed as per-room pricing, calculating the total by summing `room_amount` for each night.

## Expected Result

After this fix:
- The Booking Summary will show the actual calculated total (e.g., ZAR 2,250 for 5 nights at ZAR 450/night)
- The "Confirm Booking" button will work correctly
- The cost breakdown will display properly

## Technical Details

The Hostfully API returns rates in this format:
```json
{
  "rate_type_id": "per-unit",
  "price_type": "per_night",
  "rates": [
    { "date": "2026-02-15", "room_amount": 450 },
    { "date": "2026-02-16", "room_amount": 450 }
  ]
}
```

The fix ensures this `per_night` price type is handled identically to `per room` pricing - summing the `room_amount` for each night in the stay.

