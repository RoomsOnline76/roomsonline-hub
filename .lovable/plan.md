

# Fix Hostfully Missing 'status' Field

## Problem

The Hostfully Leads API v3 requires a `status` field but the current `leadPayload` doesn't include it:

```
Error: "Invalid parameter 'status' must not be null"
```

## Solution

Add the required `status` field to the Hostfully lead payload. The appropriate value is `INQUIRY` since this represents a booking request that needs property confirmation.

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Add `status: 'INQUIRY'` to leadPayload |

---

## Technical Change

**File:** `supabase/functions/push-booking/index.ts`

**Current Code (lines 1267-1279):**
```typescript
const leadPayload = {
  propertyUid: hostfullyUid,
  checkInDate: booking.check_in_date,
  checkOutDate: booking.check_out_date,
  firstName: firstName,
  lastName: lastName,
  email: booking.guest_email,
  phoneNumber: booking.guest_phone || '',
  adults: booking.adults || 2,
  children: (booking.children || 0) + (booking.teens || 0) + (booking.infants || 0),
  notes: booking.special_requests || '',
  source: 'HOSTFULLY_API',
};
```

**Fixed Code:**
```typescript
const leadPayload = {
  propertyUid: hostfullyUid,
  checkInDate: booking.check_in_date,
  checkOutDate: booking.check_out_date,
  firstName: firstName,
  lastName: lastName,
  email: booking.guest_email,
  phoneNumber: booking.guest_phone || '',
  adults: booking.adults || 2,
  children: (booking.children || 0) + (booking.teens || 0) + (booking.infants || 0),
  notes: booking.special_requests || '',
  source: 'HOSTFULLY_API',
  status: 'INQUIRY',  // Required field - booking request awaiting confirmation
};
```

---

## Hostfully Status Values Reference

| Status | Meaning |
|--------|---------|
| `BLOCK` | Block dates (not a booking) |
| `INQUIRY` | Potential booking/inquiry |
| `BOOKING_REQUEST` | Confirmed booking request |
| `BOOKING` | Confirmed booking |

Using `INQUIRY` is appropriate because:
1. It creates the lead in Hostfully's system
2. The property owner can then confirm/convert it to a booking
3. It doesn't immediately block the calendar (allowing for approval workflow)

---

## Expected Result

After this fix:
- Hostfully API accepts the lead creation request
- Lead is created in Hostfully with status "INQUIRY"
- Booking succeeds and user sees confirmation

