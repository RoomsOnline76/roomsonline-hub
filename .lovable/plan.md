

# Plan: Editable Bookings, Per-Person Calc Fix & Confirmation Email

## Issues

1. **Per-person calc bug**: Dungeon at R650/pp × 4 adults × 3 nights should = R7,800, but shows R1,950 (R650 × 3). The `pricing_model` field on the rate plan is likely still `'per_room'` (the default) because the migration added it with `DEFAULT 'per_room'` and existing plans weren't updated. The ManualBookingDialog calc logic is correct — the data is wrong.

2. **No edit capability**: The BookingDetail sheet is read-only. Users need to edit bookings inline from the calendar.

3. **No confirmation email**: Manual bookings don't trigger the `send-booking-email` edge function.

## Implementation

### 1. Fix existing rate plan pricing_model data

Run a targeted update in the PropertyForm sync and PMSRatePlans sync to set `pricing_model` from amenities `pricingModel` field. Also add a one-time data fix: when the PMSRatePlans page loads and syncs from amenities, if the amenity rate type name contains "per person" (case-insensitive) or has `pricingModel` set, update the DB record.

**File**: `src/pages/pms/PMSRatePlans.tsx` — in `syncFromAmenities`, ensure `pricing_model` is written from amenity data. Add fallback detection: if rate type name contains "per person", set `pricing_model: 'per_person'`.

### 2. Editable Booking from Calendar

Convert the BookingDetail sheet into an editable form:

**File**: `src/pages/pms/PMSDashboard.tsx` — `BookingDetail` component (~line 1230-1358):
- Add `isEditing` state toggle with an "Edit" button in the header
- In edit mode, render form fields for: guest name, email, phone, check-in/out dates, adults/children/teens/infants/pets, total_price, payment_status, payment_method, status, special_requests, room assignment
- On save, `UPDATE bookings SET ... WHERE id = booking.id`
- Add `queryClient` to invalidate calendar queries after save
- Pass `roomTypes`, `ratePlans`, `propertyId` to BookingDetail for room/rate selection

### 3. Send Confirmation Email on Manual Booking Creation

**File**: `src/components/pms/ManualBookingDialog.tsx` — after successful insert:
- Get the inserted booking ID from the response (change `.insert(payload)` to `.insert(payload).select('id').single()`)
- Call `supabase.functions.invoke('send-booking-email', { body: { booking_id: insertedId, status: 'success' } })`
- Show toast on email send success/failure

### 4. Verify per-person calculation in ManualBookingDialog

The calc logic at lines 98-110 is correct (`rate * guests * nights` for `per_person`). The fix is ensuring the rate plan's `pricing_model` column is properly set to `'per_person'` via the sync fixes above.

## Files Modified

| File | Change |
|------|--------|
| `src/pages/pms/PMSRatePlans.tsx` | Ensure `pricing_model` written during sync; fallback name detection |
| `src/pages/pms/PMSDashboard.tsx` | Make BookingDetail editable with inline form; pass additional props |
| `src/components/pms/ManualBookingDialog.tsx` | Send confirmation email after booking creation; get inserted ID |

