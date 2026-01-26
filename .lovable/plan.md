

# Enable Complete Booking Flow for Hostfully Properties

## Problem Summary

You can now see Hostfully rates (R450/night), but cannot complete the booking because:

1. **Missing CTA Button**: The "Check Availability" button in RoomShowcase only appears for Benson and HotelBeds properties - Hostfully is missing from the condition
2. **Missing Booking Handler**: The `push-booking` Edge Function doesn't have a case for Hostfully properties - when a booking is submitted, it returns "No external system configured" instead of creating a reservation
3. **Unused Hostfully Booking API**: The `hostfully-api` Edge Function already has a fully working `handleCreateReservation` function that is never called

## Solution

### Part 1: Fix CTA Button in RoomShowcase.tsx

Update line 860 to include Hostfully in the button label condition:

```typescript
// Current (broken)
} : (isBensonProperty || isHotelBedsProperty) ? (

// Fixed
} : (isBensonProperty || isHotelBedsProperty || isHostfullyProperty) ? (
```

This ensures the "Check Availability" button appears instead of "View Property" for Hostfully properties.

### Part 2: Add Hostfully Case to push-booking Edge Function

Add a new `else if (externalSystem === 'hostfully')` block after the HotelBeds handler (around line 1103). This will:

1. Get owner credentials from `owner_pms_credentials` table
2. Resolve the Hostfully property UID (from `external_id` or `amenities.room_types`)
3. Verify live availability via `/property-calendar` endpoint (RULE #1)
4. Create reservation via `/leads` endpoint
5. Update booking with `external_reservation_id`
6. Log sync status

### Part 3: Fetch Hostfully Availability Data for Cost Calculation

Update `Booking.tsx` to fetch availability for Hostfully properties using the `hostfully-api` edge function (similar to how Benson is handled), so cost calculation works correctly.

## Technical Details

### Data Flow After Fix

```text
User on RoomShowcase (Hostfully property)
            │
            ▼
[✓] CTA shows "Check Availability" (Part 1 fix)
            │
            ▼
Navigate to /property/:slug/room/:roomSlug/availability
            │
            ▼
User selects dates → "Proceed to Booking"
            │
            ▼
Navigate to /booking/:slug?checkIn=...&checkOut=...
            │
            ▼
[✓] Cost calculation fetches from hostfully-api (Part 3 fix)
            │
            ▼
User fills form → Submit Booking
            │
            ▼
Booking inserted to DB → push-booking called
            │
            ▼
[✓] Hostfully case handler (Part 2 fix):
    1. Get owner_pms_credentials for property.owner_id
    2. Resolve Hostfully UID from property.external_id or amenities
    3. Call Hostfully /property-calendar to verify availability
    4. Call Hostfully /leads to create reservation
    5. Update bookings.external_reservation_id
    6. Send confirmation email
            │
            ▼
Redirect to /booking-confirmation/:id?ref=HOSTFULLY_LEAD_UID
```

### Hostfully Leads API Payload

```json
{
  "propertyUid": "818e799c-df32-4d53-8765-dd8b7e2b0ff0",
  "checkInDate": "2026-02-01",
  "checkOutDate": "2026-02-05",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phoneNumber": "+27123456789",
  "adults": 2,
  "children": 0,
  "notes": "Special requests here",
  "source": "RoomsOnline"
}
```

## Files Modified

| File | Changes |
|------|---------|
| `src/pages/RoomShowcase.tsx` | Add `isHostfullyProperty` to CTA button condition (line 860) |
| `src/pages/Booking.tsx` | Add Hostfully to availability fetch logic in `calculateCost()` |
| `supabase/functions/push-booking/index.ts` | Add `else if (externalSystem === 'hostfully')` handler |

## Helper Function Needed

The push-booking function will need to resolve the Hostfully UID from the property, similar to what we added in hostfully-api:

```typescript
async function resolveHostfullyUid(supabase: any, property: any): Promise<string | null> {
  // 1. Check property.external_id
  if (property.external_id) return property.external_id;
  
  // 2. Check amenities.room_types[0].hostfullyId
  const roomTypes = property.amenities?.room_types || [];
  if (roomTypes.length > 0) {
    const room = roomTypes[0];
    if (room.hostfullyId) return room.hostfullyId;
  }
  
  // 3. Query hostfully_room_types table
  const { data: hfRoom } = await supabase
    .from('hostfully_room_types')
    .select('hostfully_room_id')
    .eq('property_id', property.id)
    .limit(1)
    .maybeSingle();
  
  return hfRoom?.hostfully_room_id || null;
}
```

## Expected Result

After these fixes:
1. Hostfully property pages show "Check Availability" button
2. Clicking "Proceed to Booking" from the calendar works correctly
3. Cost calculation displays the correct total
4. Submitting the booking creates a lead in Hostfully
5. Confirmation page shows the Hostfully lead UID as external reference
6. Confirmation email is sent to the guest

