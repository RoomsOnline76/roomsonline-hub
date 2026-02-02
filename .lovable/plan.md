
# Fix Calendar Date Blocking - Part 2: External System Mismatch

## Problem Identified

After investigating the database, I found the root cause of why confirmed bookings are not blocking calendar dates:

**Unique Constraint Mismatch:**
- The `property_availability` table has a unique constraint on `(property_id, room_type, date, external_system)` 
- Existing availability records have `external_system: 'manual'`
- The `push-booking` function creates records WITHOUT setting `external_system` (leaving it NULL)
- When upserting, the records don't match because `NULL != 'manual'`

## Evidence

| Field | Existing Record | push-booking Record |
|-------|-----------------|---------------------|
| property_id | ea9a019d-... | ea9a019d-... |
| date | 2026-02-03 | 2026-02-03 |
| room_type | "3 Bedroomed Holiday House" | "3 Bedroomed Holiday House" |
| external_system | **'manual'** | **NULL** |

This causes the upsert to either:
1. Try to INSERT a new record (which may conflict with the 3-column index)
2. Fail silently without updating the existing record

## Solution

Update `push-booking` to include `external_system: 'manual'` when creating availability blocking records for manual properties.

### File: `supabase/functions/push-booking/index.ts`

**Current Code (lines 189-196):**
```typescript
availabilityRecords.push({
  property_id: property.id,
  date: dateStr,
  available_units: 0,
  is_stop_sell: true,
  room_type: String(roomType),
  // external_system left null for manual properties  <-- THIS IS WRONG
});
```

**Fixed Code:**
```typescript
availabilityRecords.push({
  property_id: property.id,
  date: dateStr,
  available_units: 0,
  is_stop_sell: true,
  room_type: String(roomType),
  external_system: 'manual',  // Match existing records for manual properties
});
```

Also update the conflict columns to include `external_system` for exact matching:

**Current (line 206):**
```typescript
onConflict: 'property_id,date,room_type',
```

**Fixed:**
```typescript
onConflict: 'property_id,room_type,date,external_system',
```

## Implementation Steps

1. Update `push-booking` function at line ~195 to add `external_system: 'manual'`
2. Update the `onConflict` parameter at line ~206 to use the 4-column unique constraint
3. Deploy the updated edge function
4. Test by re-triggering a booking confirmation

## Why This Fixes It

When both the existing record AND the new record have `external_system: 'manual'`:
- The 4-column unique constraint finds an exact match
- The upsert correctly UPDATES the existing record
- `is_stop_sell` becomes `true` and `available_units` becomes `0`
- The calendar shows the dates as blocked

## Verification

After fix:
1. Run push-booking for booking `e8dadecf-e2a0-42d5-836d-839d6635ca4d`
2. Query `property_availability` for dates 2026-02-03 through 2026-02-05
3. Confirm `is_stop_sell = true` and `available_units = 0`
