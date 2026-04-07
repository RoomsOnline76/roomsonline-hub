

# Fix: Properties Not Showing on /book Page + Map Not Loading

## Root Cause

Both the property listing and map on the `/book` page filter properties by requiring their `external_system` to match a PMS entry in `pms_tracker_status` where `is_production = true`.

Currently only **benson**, **google**, and **nightsbridge** are marked as production. Most properties use **roomsonline** (5 properties) or **hostfully** (6 properties) — both marked `is_production = false`. This means only Coot Club (benson) and Torburnlea (nightsbridge) pass the filter.

The map shows no pins because after filtering, too few properties have coordinates, and the map may not initialize properly with an empty dataset.

## Fix

### 1. Remove PMS production filter from property display

In both `src/components/HomePropertySegments.tsx` and `src/components/PropertiesMap.tsx`, remove the `pms_tracker_status` lookup and the `external_system` filter. Properties already have `is_active = true` and `show_on_website = true` as their visibility gates — the PMS production status should not determine whether a property appears on the public site.

**`src/components/HomePropertySegments.tsx`** (lines 148–173):
- Remove the `pms_tracker_status` query
- Remove the `.filter(p => p.external_system && activeSystemTypes.includes(p.external_system))` step
- Keep the existing `.eq("is_active", true)`, `.eq("show_on_website", true)`, `.is("permanently_deleted_at", null)` filters

**`src/components/PropertiesMap.tsx`** (lines 66–98):
- Remove the `pms_tracker_status` query
- Remove the `.filter(p => p.external_system && activeSystemTypes.includes(p.external_system))` step
- Keep existing `is_active` and `show_on_website` filters

### 2. Also fix PropertySegmentSection if it uses the same pattern

Check `src/components/PropertySegmentSection.tsx` (used on `/property_listing`) for the same PMS filter and remove it there too.

## Files changed

| File | Change |
|---|---|
| `src/components/HomePropertySegments.tsx` | Remove PMS production filter from property query |
| `src/components/PropertiesMap.tsx` | Remove PMS production filter from property fetch |
| `src/components/PropertySegmentSection.tsx` | Remove PMS production filter if present |

## What does NOT change
- Database schema unchanged
- `pms_tracker_status` table unchanged (still used for PMS config, just not for public visibility)
- Property admin toggle for `show_on_website` remains the visibility gate

