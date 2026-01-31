

# Plan: Display Property Restrictions on Calendar with Colored Legend

## Problem Summary

The calendar for manual properties (like "Latter Days") already has:
- A **legend** with colored indicators (Stop Sell = red, Min Stay = blue, Max Stay = pink, Lead Days Advance = yellow, Lead Days Post = orange)
- **Rendering logic** to display colored bars under availability cells when restrictions exist
- A **`getRestrictions()` helper** that reads from `pmsData.restrictionsByDate`

However, restrictions are NOT appearing because `generateManualPropertyData()` only populates `restrictionsByDate` when there's a manual override in `property_availability`. The **room-level default restrictions** from the wizard (like `minStay: 1`, `maxStay: 0`) are not being applied.

## Solution

Update `generateManualPropertyData()` to:
1. Read room-level default restrictions from wizard config (`minStay`, `maxStay` from each room in `room_types`)
2. Apply these defaults to ALL dates in the calendar range
3. Merge manual overrides from `property_availability` on top (overrides take precedence)

## Technical Implementation

### CalendarAccommodation.tsx - Apply Default Restrictions

**Location**: `src/pages/CalendarAccommodation.tsx`, inside `generateManualPropertyData` function (around lines 676-700)

**Current code (only populates when override exists):**
```typescript
// Restrictions from overrides
if (override) {
  restrictionsByDate[dateStr] = {
    stopSell: override.is_stop_sell,
    minStay: override.minimum_stay,
    maxStay: override.maximum_stay,
    leadDaysAdvance: override.lead_days_advance,
    leadDaysPost: override.lead_days_post,
  };
}
```

**Updated code (apply room defaults, merge overrides):**
```typescript
// Room-level default restrictions from wizard config
const roomMinStay = room.minStay ?? room.minimum_stay ?? null;
const roomMaxStay = room.maxStay ?? room.maximum_stay ?? null;

// Start with room defaults
restrictionsByDate[dateStr] = {
  stopSell: override?.is_stop_sell ?? false,
  minStay: override?.minimum_stay ?? roomMinStay,
  maxStay: override?.maximum_stay ?? roomMaxStay,
  leadDaysAdvance: override?.lead_days_advance ?? null,
  leadDaysPost: override?.lead_days_post ?? null,
};
```

This ensures:
- **Every date** has restriction data populated (not just override dates)
- **Room defaults** (`minStay: 1`, `maxStay: 0`) appear on all dates
- **Manual overrides** take precedence when they exist

## Data Flow After Implementation

```text
Calendar loads for "Latter Days"
         ↓
generateManualPropertyData() reads room_types[0]:
  - minStay: 1, maxStay: 0 (from wizard)
         ↓
For each date in range:
  - Sets restrictionsByDate[date] = { minStay: 1, maxStay: 0, ... }
  - If manual override exists, merges it on top
         ↓
Calendar renders → every date shows blue "1" bar for min stay
         ↓
Feb 3-7 also show red bar (stop sell from property_availability)
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/CalendarAccommodation.tsx` | Update `generateManualPropertyData` to apply room-level default restrictions to all dates, with overrides taking precedence |

## Visual Result

| Before | After |
|--------|-------|
| Only Feb 3-7 show red stop-sell bar | Feb 3-7 show red stop-sell bar |
| No min stay indicators | All dates show blue "1" bar (min stay) |
| Restrictions only appear on override dates | Room defaults visible on all dates |

## Edge Cases

1. **Room has no minStay/maxStay defined**: Default to `null` (no restriction shown)
2. **maxStay = 0**: Treat as "no maximum" (filter out in display condition `maxStay > 0`)
3. **Override with null values**: Override takes precedence, allowing clearing of restrictions
4. **Multiple room types with different defaults**: Each room row shows its own restrictions

## Additional Consideration - Availability Units

The plan also addresses the previously discussed issue of using actual room units (from `room.units`) instead of hardcoded `99`:

```typescript
// Get room's actual unit count (defaults to 1 if not set)
const roomUnits = room.units || 1;

// Use room units as default, respect overrides
availabilityByDate[dateStr] = override?.available_units ?? roomUnits;
```

This change will be included in the same implementation to ensure "Latter Days" shows "1" available instead of "99".

