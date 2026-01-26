

# Fix Hostfully Calendar Sync: Incorrect API Endpoint

## Problem Summary

The Hostfully calendar sync is failing with `NOT_FOUND` error because the edge function is using an **incorrect API endpoint**:

| Current Endpoint (Wrong) | Correct Endpoint |
|-------------------------|------------------|
| `/properties/{uid}/calendar` | `/property-calendar/{uid}` |

### Evidence from Logs

```
[Hostfully] GET https://sandbox.hostfully.com/api/v3/properties/818e799c-df32-4d53-8765-dd8b7e2b0ff0/calendar?startDate=2026-01-01&endDate=2026-01-31

Response: NOT_FOUND - "Hostfully resource not found"
```

The API key is now valid (error changed from `AUTH_FAILED` to `NOT_FOUND`), confirming the credential fix worked. The issue is now the endpoint path.

---

## Root Cause

The Hostfully API v3 uses a **top-level resource pattern** for calendars:
- **Correct**: `GET /property-calendar/{propertyUid}?from={date}&to={date}`
- **Current (Wrong)**: `GET /properties/{propertyUid}/calendar?startDate={date}&endDate={date}`

Also, the query parameters are incorrect:
- **Correct**: `from` and `to`
- **Current (Wrong)**: `startDate` and `endDate`

---

## Additional Issue: No Rooms Imported

The `hostfully_room_types` table has **no entries** for this property, meaning the full ingestion was not completed. This may need to be re-triggered, but first the calendar endpoint must work.

---

## Solution

### Part 1: Fix Calendar Endpoint

**File**: `supabase/functions/hostfully-api/index.ts`

**Line 738** - Change endpoint pattern and query parameters:

```typescript
// FROM (wrong):
const endpoint = `/properties/${propertyUid}/calendar?startDate=${startDate}&endDate=${endDate}`;

// TO (correct per Hostfully API v3):
const endpoint = `/property-calendar/${propertyUid}?from=${startDate}&to=${endDate}`;
```

**Line 839** - Same fix in `handleCreateReservation`:

```typescript
// FROM (wrong):
const calendarEndpoint = `/properties/${propertyUid}/calendar?startDate=${reservationData.checkInDate}&endDate=${reservationData.checkOutDate}`;

// TO (correct):
const calendarEndpoint = `/property-calendar/${propertyUid}?from=${reservationData.checkInDate}&to=${reservationData.checkOutDate}`;
```

### Part 2: Handle Response Format Difference

The Hostfully `/property-calendar` endpoint may return a different response format. We need to verify and potentially update the `mapHostfullyCalendarToAvailability` function if needed.

---

## Files Modified

| File | Line | Change |
|------|------|--------|
| `supabase/functions/hostfully-api/index.ts` | 738 | Change endpoint from `/properties/{uid}/calendar` to `/property-calendar/{uid}` and query params from `startDate/endDate` to `from/to` |
| `supabase/functions/hostfully-api/index.ts` | 839 | Same fix for reservation availability check |

---

## Technical Details

### Hostfully API v3 Calendar Endpoint
Reference: https://dev.hostfully.com/reference/findbypropertyuid_1

```
GET /property-calendar/{propertyUid}?from=YYYY-MM-DD&to=YYYY-MM-DD
```

Returns an array of calendar day objects with availability and pricing.

### Expected Response Format
```json
[
  {
    "date": "2026-01-01",
    "available": true,
    "price": 150.00,
    "minimumStay": 2,
    "checkInAllowed": true,
    "checkOutAllowed": true
  }
]
```

---

## Expected Outcome

After this fix:
1. Hostfully calendar sync will successfully fetch availability data
2. The calendar grid will populate with availability and rates
3. Booking creation will properly check live availability before confirming

---

## Post-Fix Recommendation

After the calendar endpoint is fixed, you may want to re-run the **full property ingestion** to populate the `hostfully_room_types` table with room data. This can be done from the Admin > API Keys page using the "Sync" or "Import" action for the property.

