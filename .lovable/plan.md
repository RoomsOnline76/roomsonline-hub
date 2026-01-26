

# Fix Hostfully Booking Errors + Ensure Accurate Success Reporting

## Problem Summary

Two critical issues are causing bookings to show "SUCCESS" in the UI while failing in the backend:

### Issue 1: Wrong Enum Value in Hostfully API
The `source` field is set to `'RoomsOnline'` (line 1278 of push-booking), but Hostfully only accepts these values:
- `DIRECT_HVMI`, `HOSTFULLY_ICAL`, `DIRECT_REDAWNING`, `DIRECT_GOOGLE`, `HOSTFULLY_UI`, `HOSTFULLY_OWNER_PORTAL`, `HOSTFULLY_LINKED`, `DIRECT_HOMETOGO`, `DIRECT_BOOKINGDOTCOM`, `HOSTFULLY_API`, `DIRECT_VRBO`, `DIRECT_AIRBNB`, `HOSTFULLY_DBS`

### Issue 2: Silent Error Swallowing
The frontend error handler (Booking.tsx lines 817-824) catches errors from `push-booking` and only re-throws them if they contain `AVAILABILITY_CHANGED`. All other errors (like the enum error) are logged but swallowed, allowing the booking to proceed to "success" even though the external system integration failed.

---

## Solution Overview

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Fix `source` field to use `HOSTFULLY_API` enum value |
| `src/pages/Booking.tsx` | Properly check push-booking results and fail if external sync failed |

---

## Technical Changes

### Part 1: Fix Hostfully Source Enum

**Current Code (line 1278):**
```typescript
source: 'RoomsOnline',
```

**Fixed Code:**
```typescript
source: 'HOSTFULLY_API',
```

This uses the correct Hostfully enum value for API-driven bookings.

---

### Part 2: Ensure Frontend Shows Accurate Status

The current error handling silently swallows external push failures. The fix ensures that if ALL external system pushes fail, the user sees an error instead of success.

**Current Flow (broken):**
1. Insert booking into DB (succeeds)
2. Push to external system (fails with enum error)
3. Error is caught and logged but not re-thrown
4. User sees "Success!" and is redirected to confirmation page
5. Email shows the actual error

**Fixed Flow:**
1. Insert booking into DB (succeeds)
2. Push to external system (fails)
3. Check if ANY external push succeeded
4. If none succeeded AND there were expected pushes, show error to user
5. Delete the local booking record (optional, or mark as 'failed')
6. User sees the actual error message

**Code Changes in Booking.tsx (lines 795-824):**

```typescript
// After push-booking call
const pushResults = pushResponse.data?.results || [];
const hasAnySuccess = pushResults.some((r: any) => r.success);
const failedResult = pushResults.find((r: any) => !r.success);

// Check for availability-specific errors (RULE #1: PMS is source of truth)
const availabilityError = pushResults.find(
  (r: any) => r.error_code === 'AVAILABILITY_CHANGED'
);

if (availabilityError) {
  // Delete the booking record since it can't be fulfilled
  await supabase.from('bookings').delete().eq('id', data.id);
  throw new Error('AVAILABILITY_CHANGED: The selected dates are no longer available.');
}

// If ALL pushes failed (no availability issue), show the actual error
if (pushResults.length > 0 && !hasAnySuccess) {
  // Update booking status to 'failed' instead of deleting
  await supabase.from('bookings').update({ status: 'failed' }).eq('id', data.id);
  
  const errorMessage = failedResult?.error || 'Failed to complete booking with property';
  throw new Error(`Booking failed: ${errorMessage}`);
}

// Extract external reservation IDs from successful pushes
if (pushResponse.data?.external_reservation_ids) {
  externalRefIds = pushResponse.data.external_reservation_ids.map((id: any) => String(id));
} else {
  const successfulResults = pushResults.filter((r: any) => r.success && r.external_booking_id);
  externalRefIds = successfulResults.map((r: any) => String(r.external_booking_id));
}
```

---

## Updated Error Handling Flow

```text
User clicks "Confirm Booking"
         │
         ▼
   ┌─────────────────────┐
   │ Insert into DB      │
   │ (status: pending)   │
   └─────────────────────┘
         │
         ▼
   ┌─────────────────────┐
   │ push-booking runs   │
   │ with correct enum   │◄── FIX 1: HOSTFULLY_API
   └─────────────────────┘
         │
         ▼
   ┌─────────────────────┐
   │ Check pushResults   │
   └─────────────────────┘
         │
    ┌────┴────┐
    │         │
  Success    Failure
    │         │
    ▼         ▼
  Show      Mark booking
  Success   as 'failed'
  Page      + Show Error ◄── FIX 2: No more silent swallowing
```

---

## Expected Results

1. **Hostfully bookings will work** - Using `HOSTFULLY_API` satisfies the enum validation
2. **Honest status reporting** - Users only see "Success" when the booking is actually confirmed with the property system
3. **Failed bookings are marked correctly** - Status is set to 'failed' instead of remaining 'pending'
4. **Better debugging** - Actual error messages are shown to users, not just logged

---

## Technical Details

The Hostfully API expects the `source` field to identify how the booking originated. `HOSTFULLY_API` is the correct value for bookings created programmatically via their API.

By removing the try-catch that swallows non-availability errors, the frontend will properly propagate failures to the user. This ensures the "truth" shown in the UI matches the "truth" sent in the email.

