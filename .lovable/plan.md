
# Fix Rates Flow for Latter Days and HotelBeds Booking Calculation

## Summary

The booking checkout page is not calculating costs correctly for two property types:
1. **Latter Days (no PMS, cache-based)**: Room ID mismatch between property amenities (numeric IDs like "1") and availability cache (slugified names like "holiday-house")
2. **HotelBeds**: Missing live API fetch - currently falling through to stale cache instead of fetching fresh availability like Benson and Hostfully do

---

## Root Cause Analysis

### Issue 1: Latter Days Room Matching

The booking flow uses cache data where room types are keyed by slugified names:
- Cache: `external_room_type_id = "holiday-house"`, `"two-bedroom-suite"`
- Amenities: `id = 1, 2, 3, 4` (numeric)

The existing alias-matching logic at lines 502-505 in Booking.tsx should handle this, but the order of operations has a subtle bug:
- The `roomAliases` map is built correctly: `"1" -> ["holiday-house"]`
- The transform creates aliases correctly: `["holiday-house", "1"]`
- BUT the matching at line 502 may fail if the roomTypeId stored in the booking room object is different from what's expected

### Issue 2: HotelBeds Missing Live API Fetch

In `calculateCost()` (Booking.tsx), there's explicit handling for:
- Benson: fetches from `benson-api` (lines 419-432)
- Hostfully: fetches from `hostfully-api` (lines 433-446)

HotelBeds falls through to the generic cache path (lines 448-476), but:
1. HotelBeds supports live availability (confirmed in its adapter)
2. Using stale cache data can cause pricing errors
3. HotelBeds requires camelCase params (`startDate`, `endDate`)

---

## Technical Section

### File Changes Required

```text
File: src/pages/Booking.tsx

1. Add HotelBeds-specific live API fetch in calculateCost():
   - After the hostfully branch (line 446)
   - Before the generic cache fallback
   - Use camelCase parameters (startDate, endDate) for HotelBeds API
   - Unwrap response same as Benson/Hostfully

2. Fix room alias matching to be bidirectional:
   - Currently only checks if cache aliases include the room ID
   - Should also check if room's slugified name matches cache ID
```

### Implementation Details

**Add HotelBeds API Branch (after line 446):**
```typescript
} else if (externalSystem === 'hotelbeds') {
  // HotelBeds: fetch from API directly with camelCase params
  const { data, error } = await supabase.functions.invoke("hotelbeds-api", {
    body: {
      action: "fetch_availability",
      property_id: property.id,
      startDate: checkIn,
      endDate: checkOut,
    },
  });

  if (error) throw error;
  availability = data?.data || data;
```

**Enhance room matching (around line 497-508):**
- Add additional check: if the room's name slugified matches the cache room_type_id
- This provides redundant matching to ensure both directions work

---

## Implementation Steps

1. **Add HotelBeds API fetch branch** in the `calculateCost()` function
   - Insert after Hostfully branch, before generic cache fallback
   - Use camelCase parameters as required by HotelBeds API

2. **Add debug logging** to trace room matching
   - Log the room ID being searched and available room types
   - This helps diagnose any remaining matching issues

3. **Verify alias lookup** works for numeric-to-slug matching
   - The existing logic should work, but add fallback check

---

## Testing Checklist

After implementation:
1. Navigate to Latter Days property showcase, select dates, and proceed to booking
2. Verify the cost breakdown shows correct line items with prices
3. Complete a test booking and verify it goes through to confirmation
4. Navigate to HotelBeds property showcase, select dates, and proceed to booking
5. Verify HotelBeds fetches live availability (check console for API call)
6. Verify the cost breakdown shows correct EUR pricing
7. Complete a test booking flow to confirmation page
