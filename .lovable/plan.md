
# Fix Hostfully Lead API - Nest Guest Information

## Problem

The Hostfully Leads API is rejecting the booking with:
```
"guestInformation is required"
```

## Root Cause

Hostfully API v3 requires guest details to be nested inside a `guestInformation` object. The current code sends them as top-level fields:

**Current (Wrong):**
```typescript
const leadPayload = {
  agencyUid: ...,
  propertyUid: ...,
  checkInLocalDateTime: ...,
  checkOutLocalDateTime: ...,
  firstName: firstName,        // ❌ Top-level
  lastName: lastName,          // ❌ Top-level
  email: booking.guest_email,  // ❌ Top-level
  phoneNumber: ...,            // ❌ Top-level
  adults: ...,
  ...
};
```

**Required (Correct):**
```typescript
const leadPayload = {
  agencyUid: ...,
  propertyUid: ...,
  checkInLocalDateTime: ...,
  checkOutLocalDateTime: ...,
  guestInformation: {          // ✅ Nested object
    firstName: firstName,
    lastName: lastName,
    email: booking.guest_email,
    phoneNumber: ...,
  },
  adults: ...,
  ...
};
```

## Solution

Move the four guest fields (`firstName`, `lastName`, `email`, `phoneNumber`) into a nested `guestInformation` object.

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Nest guest fields inside `guestInformation` object |

---

## Technical Details

### File: `supabase/functions/push-booking/index.ts`

**Lines 1276-1290 - Current Code:**
```typescript
const leadPayload = {
  agencyUid: ownerCreds.external_account_id,
  propertyUid: hostfullyUid,
  checkInLocalDateTime: checkInDateTime,
  checkOutLocalDateTime: checkOutDateTime,
  firstName: firstName,
  lastName: lastName,
  email: booking.guest_email,
  phoneNumber: booking.guest_phone || '',
  adults: booking.adults || 2,
  children: (booking.children || 0) + (booking.teens || 0) + (booking.infants || 0),
  notes: booking.special_requests || '',
  source: 'HOSTFULLY_API',
  status: 'NEW',
};
```

**Fixed Code:**
```typescript
const leadPayload = {
  agencyUid: ownerCreds.external_account_id,
  propertyUid: hostfullyUid,
  checkInLocalDateTime: checkInDateTime,
  checkOutLocalDateTime: checkOutDateTime,
  guestInformation: {
    firstName: firstName,
    lastName: lastName,
    email: booking.guest_email,
    phoneNumber: booking.guest_phone || '',
  },
  adults: booking.adults || 2,
  children: (booking.children || 0) + (booking.teens || 0) + (booking.infants || 0),
  notes: booking.special_requests || '',
  source: 'HOSTFULLY_API',
  status: 'NEW',
};
```

---

## Hostfully API v3 Reference

From the Hostfully V2 to V3 migration guide, the Leads API added:
- `guestInformation` object (required)
- `guestInformation.passportId` (optional)
- `guestInformation.passportCountryCode` (optional)

The four core guest fields (`firstName`, `lastName`, `email`, `phoneNumber`) must now be inside this nested object.

---

## Expected Result

After this fix:
- Hostfully API accepts the lead creation request
- Lead is created successfully with guest information
- Booking completes and user sees confirmation page
- Guest details properly associated with the reservation
