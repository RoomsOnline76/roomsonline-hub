

# Fix: Bookings Not Blocking Dates + Duplicate Pending Entries

## Root Cause Analysis

### Issue 1: Dates Not Blocked in Calendars/Embeds

**Three cascading failures:**

1. **Room type ID mismatch**: When `push-booking` calls `roomsonline-pms-api` → `create_reservation`, it passes the booking's `room_type_id` (a UUID from `hostfully_room_types`, e.g. `c8253bc0-...` = "3 Bedroomed Holiday House"). But `roomsonline-pms-api` checks availability against `pms_availability_cache` where `external_room_type_id` uses **slug-based IDs** (e.g. `holiday-house`, `petite-hotel-room`). No match → `available_units = 0` → returns `AVAILABILITY_CHANGED` error.

2. **Fallback path skipped**: `push-booking` catches the ROL PMS error at line 244 and is supposed to "fall through to manual mode". But the manual mode check at line 250 requires `!externalSystem || externalSystem === 'none'`. Since `externalSystem = 'roomsonline'`, the manual date-blocking code is **never reached**.

3. **No `property_availability` or `rolos_inventory_calendar` records created**: Neither the ROL PMS path nor the manual path succeeds, so zero date-blocking occurs. Confirmed by querying both tables — both return empty for this property's booked dates.

### Issue 2: Duplicate Booking Entries (Pending + Paid)

The `pending` entries are orphaned bookings from earlier attempts where the user started checkout but either:
- Cancelled the PayFast modal
- Encountered an error and re-tried

`Booking.tsx` creates a new `bookings` row (status: `pending`) on every "Book Now" click. There is no deduplication — if the user clicks again, a second `pending` row is created. The PayFast ITN only updates the specific booking it was given, leaving the prior attempt as a ghost `pending` row.

## Fix Plan

### Fix 1: `push-booking` — ROL fallback must block dates (Critical)

In `supabase/functions/push-booking/index.ts`, when the ROL PMS `create_reservation` call fails (the catch block at line 244), the code currently falls through but skips manual mode. 

**Change**: After the ROL PMS catch block, explicitly run the same date-blocking logic that the manual mode uses (lines 259-326), regardless of `externalSystem` value. Also mark the booking as confirmed since payment is already processed.

```
// Line ~244-248: After ROL PMS error catch
} catch (rolError) {
  console.error('Error creating ROL reservation:', rolError);
  // CRITICAL FIX: Still block dates and confirm booking even if ROL PMS adapter fails
  // Payment has already been processed by PayFast, so the booking is valid
  
  [insert the same date-blocking logic from lines 259-326]
  [set booking status to 'confirmed']
  [send owner notification + guest email]
  [return success response]
}
```

### Fix 2: `roomsonline-pms-api` — Map UUID room_type_ids to cache slugs

In `supabase/functions/roomsonline-pms-api/index.ts` `handleCreateReservation`, before checking `pms_availability_cache`, look up the room type name from `hostfully_room_types` or `rolos_room_types` and slugify it to match the `external_room_type_id` format used in the cache. This is the proper long-term fix so the ROL PMS path works correctly.

### Fix 3: `Booking.tsx` — Prevent duplicate pending bookings

Before creating a new booking, check if a `pending`/`unpaid` booking already exists for the same property, dates, and guest email. If found, reuse it instead of inserting a new row. This prevents orphaned `pending` records.

### Fix 4: Clean up existing orphaned bookings

Mark the two orphaned `pending` bookings as `cancelled` and retroactively block the dates for the two `paid` bookings.

## Files to Change

| File | Change |
|------|--------|
| `supabase/functions/push-booking/index.ts` | Add date-blocking fallback in ROL PMS error catch block (extract shared blocking function) |
| `supabase/functions/roomsonline-pms-api/index.ts` | Map UUID room_type_ids → slug-based external_room_type_ids before availability check |
| `src/pages/Booking.tsx` | Check for existing pending booking before inserting a new one; reuse if found |
| Database (one-time fix) | Cancel orphaned pending bookings; block dates for paid bookings |

