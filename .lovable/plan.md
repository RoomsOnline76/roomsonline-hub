

# ✅ COMPLETED: Fix Hostfully Availability Fetch - Property ID Translation

## Implementation Summary

Updated the `hostfully-api` Edge Function to accept the frontend's parameter format (`property_id`, `start_date`, `end_date`) and auto-translate ROL property IDs to Hostfully UIDs.

### Changes Made

1. **Updated `fetchAvailabilitySchema`** - Now accepts both formats:
   - `propertyUid` OR `property_id` (at least one required)
   - `startDate`/`endDate` OR `start_date`/`end_date` (at least one pair required)

2. **Added `resolveHostfullyPropertyUid()` helper** - Resolves Hostfully UID from:
   - Direct `propertyUid` if provided
   - Property's `external_id` if set
   - Property's `amenities.room_types[0].hostfullyId` or `pmsRoomId` (fallback)

3. **Updated `fetch_availability` case handler** - Uses the new resolver and date normalization

### Files Modified

| File | Changes |
|------|---------|
| `supabase/functions/hostfully-api/index.ts` | Schema update, helper function, case handler update |

### Result

- PropertyShowcase and RoomShowcase now work with Hostfully properties
- Both snake_case and camelCase parameter formats supported
- Backward compatibility maintained for direct `propertyUid` calls
