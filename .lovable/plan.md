
# Fix Hostfully Missing agencyUid Field

## Problem

The Hostfully Leads API requires `agencyUid` in the payload but it's currently not being sent:

**Error:** `"Invalid parameter 'agencyUid' must not be blank"`

## Root Cause

The `leadPayload` in `push-booking/index.ts` is missing the `agencyUid` field. The data is available in `ownerCreds.external_account_id` (which is already fetched from the `owner_pms_credentials` table) but it's not being included in the API request.

## Solution

Add the `agencyUid` field to the lead payload using the existing `ownerCreds.external_account_id` value.

| File | Changes |
|------|---------|
| `supabase/functions/push-booking/index.ts` | Add `agencyUid: ownerCreds.external_account_id` to leadPayload |

---

## Technical Change

**File:** `supabase/functions/push-booking/index.ts`

**Current Code (lines 1267-1280):**
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
  status: 'NEW',
};
```

**Fixed Code:**
```typescript
const leadPayload = {
  agencyUid: ownerCreds.external_account_id,  // Required - Hostfully agency identifier
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
  status: 'NEW',
};
```

---

## Data Flow Verification

The database already has this data properly populated:

| Property | Agency UID | Source |
|----------|------------|--------|
| [SANDBOX] Victorian House (Sample) | `1f217567-5e8c-464f-940f-2878cff4d3b3` | `owner_pms_credentials.external_account_id` |

The `ownerCreds` variable is already fetched from `owner_pms_credentials` table (line ~1139-1145), so `ownerCreds.external_account_id` is available and contains the correct agency UID.

---

## Error Prevention

Also add validation to ensure the agency UID exists before making the API call:

```typescript
if (!ownerCreds.external_account_id) {
  throw new Error('Hostfully Agency UID not configured in owner credentials');
}
```

---

## Expected Result

After this fix:
- Hostfully API receives the required `agencyUid` field
- Lead is created successfully in Hostfully
- Booking completes and user sees confirmation page
