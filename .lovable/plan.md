

# Dynamic Accommodation Labels — RoomShowcase + Booking Hardcoded Fixes

## Problem

The screenshot shows "This room is part of SIX ON N" on the room detail page, but SIX ON N has its accommodation label set to "Apartment". Several user-facing strings in `RoomShowcase.tsx` and `Booking.tsx` still hardcode "room" instead of using the dynamic `getAccommodationLabel()` helper.

## Changes

### 1. `src/pages/RoomShowcase.tsx`

**Add `property_type` to the Property interface** (it comes from `public_properties` but isn't typed).

**Import `getAccommodationLabel`** and derive the label from `property` state.

**Replace hardcoded strings:**

| Line | Current | New |
|------|---------|-----|
| 1067 | `"This room is part of"` | `"This {label.singular} is part of"` |
| 889 | `"This room uses the..."` | `"This {label.singular} uses the..."` |
| 780 | `{/* Room Summary Card */}` (comment only, cosmetic) | no change needed |

### 2. `src/pages/Booking.tsx`

Already imports `getAccommodationLabel` and has `accommodationLabel` variable. Fix remaining hardcoded spots:

| Line | Current | New |
|------|---------|-----|
| 1875 | `` `Room ${index + 1}` `` | `` `${accommodationLabel.singular} ${index + 1}` `` |
| 1980 | `"Add another room"` | `"Add another ${accommodationLabel.singular.toLowerCase()}"` |
| 1422 | `"At least one room is required"` | `"At least one ${accommodationLabel.singular.toLowerCase()} is required"` |

### 3. No database or migration changes needed

The property already has `amenities.accommodation_label` set to `apartment`. The fix is purely about consuming the label in the two page components.

## Files

| Action | File |
|--------|------|
| Modify | `src/pages/RoomShowcase.tsx` — import helper, add `property_type` to interface, replace 2 hardcoded "room" strings |
| Modify | `src/pages/Booking.tsx` — replace 3 remaining hardcoded "room" strings with `accommodationLabel` |

