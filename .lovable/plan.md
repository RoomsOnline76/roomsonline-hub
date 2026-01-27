
# Fix Hostfully Booking: Guest Counts and Country

## Summary

The Hostfully booking integration is sending guest counts incorrectly and missing the country code, causing:
1. **Guest counts not applied** - Adults/children always show as 1/0 in Hostfully
2. **Country defaults to US** - Guest shows as United States instead of South Africa

## Root Cause Analysis

From the Hostfully API response, I can see the exact structure expected. The push-booking edge function sends:

```json
{
  "guestInformation": {
    "firstName": "Dawie",
    "lastName": "Hostfully TEST",
    "email": "dev@roomsonline.co.za",
    "phoneNumber": "0824602220"
  },
  "adults": 3,       // ← TOP LEVEL (IGNORED!)
  "children": 3      // ← TOP LEVEL (IGNORED!)
}
```

But Hostfully API v3 expects guest counts **INSIDE** `guestInformation`:

```json
{
  "guestInformation": {
    "firstName": "...",
    "lastName": "...",
    "email": "...",
    "phoneNumber": "...",
    "adultCount": 3,      // ← INSIDE guestInformation
    "childrenCount": 3,   // ← INSIDE guestInformation
    "infantCount": 0,     // ← INSIDE guestInformation
    "countryCode": "ZA"   // ← 2-letter ISO code
  }
}
```

The API silently ignores top-level `adults` and `children` fields, defaulting to 1 adult and 0 children.

---

## Technical Fix

### File: `supabase/functions/push-booking/index.ts`

**Lines 1276-1292** - Move guest counts inside `guestInformation` and add country code:

**Before:**
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

**After:**
```typescript
// Determine country code - prefer property country, fallback to ZA (South Africa)
const propertyCountry = property.country || 'South Africa';
const countryCode = getCountryCode(propertyCountry); // e.g., "ZA", "US", "GB"

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
    // Guest counts MUST be inside guestInformation for Hostfully v3 API
    adultCount: booking.adults || 1,
    childrenCount: booking.children || 0,
    infantCount: booking.infants || 0,
    // Country code to prevent defaulting to US
    countryCode: countryCode,
  },
  // Keep top-level for backwards compatibility (may be ignored by API)
  adults: booking.adults || 1,
  children: booking.children || 0,
  notes: booking.special_requests || '',
  source: 'HOSTFULLY_API',
  status: 'NEW',
};
```

### Add Country Code Helper Function

Add a helper function to map country names to ISO 2-letter codes:

```typescript
// Map common country names to ISO 2-letter codes
function getCountryCode(countryName: string): string {
  const countryMap: Record<string, string> = {
    'south africa': 'ZA',
    'united states': 'US',
    'usa': 'US',
    'united kingdom': 'GB',
    'uk': 'GB',
    'australia': 'AU',
    'canada': 'CA',
    'germany': 'DE',
    'france': 'FR',
    'spain': 'ES',
    'italy': 'IT',
    'netherlands': 'NL',
    'portugal': 'PT',
    'brazil': 'BR',
    'namibia': 'NA',
    'botswana': 'BW',
    'zimbabwe': 'ZW',
    'zambia': 'ZM',
    'mozambique': 'MZ',
    'kenya': 'KE',
    'tanzania': 'TZ',
  };
  
  const normalized = countryName.toLowerCase().trim();
  return countryMap[normalized] || 'ZA'; // Default to South Africa
}
```

---

## Database Verification

The booking record has the correct values stored:
- `adults: 3`
- `children: 3`
- `infants: 0`
- `teens: 0`

The issue is purely in the API payload structure sent to Hostfully.

---

## Expected Results After Fix

1. **Guest counts**: Will correctly show 3 adults and 3 children in Hostfully lead details
2. **Country**: Will show "South Africa" (or the property's country) instead of "United States"
3. **Phone number**: Will no longer have incorrect +1 US prefix added

---

## File Changes Summary

| File | Change |
|------|--------|
| `supabase/functions/push-booking/index.ts` | Move guest counts inside guestInformation with correct field names (`adultCount`, `childrenCount`, `infantCount`). Add `countryCode` field based on property country. Add helper function to map country names to ISO codes. |

---

## API Evidence

Hostfully API response showed the correct structure expected:
```json
"guestInformation": {
  "adultCount": 1,        // ← These are the fields Hostfully uses
  "childrenCount": 0,
  "infantCount": 0,
  "petCount": 0,
  "countryCode": null     // ← Was null, causing US default
}
```
