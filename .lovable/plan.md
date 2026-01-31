
# Plan: Manual Rates for No-PMS Properties - Bookable with Property Email Notification

## Overview

This plan enables properties without a PMS connection to be bookable on the public-facing PropertyShowcase page using rates captured during the onboarding wizard. Since there's no PMS to sync bookings to, the property owner must be notified via email when a paid booking is received.

## Current State Analysis

### What Exists
- **Wizard Rates**: Properties capture room types, rates, and seasons in the onboarding wizard (`amenities.room_types`, `amenities.seasons`)
- **RatesOverviewPanel**: Already displays these manual rates in the `/edit property` page
- **is_rol_property**: Database flag exists to identify ROL-managed properties without external PMS
- **owner_email**: Field on properties table stores property owner contact
- **push-booking**: Already handles `!externalSystem` case - returns early with "No external system configured" 

### What's Missing
1. **PropertyShowcase**: Does not display rates for non-PMS properties (no PMS API call = no rates loaded)
2. **Booking.tsx**: Cost calculation fails for non-PMS properties (no `pms_availability_cache` data)
3. **push-booking**: Does not trigger property owner email for non-PMS bookings
4. **Availability**: Currently requires PMS sync - no mechanism to assume availability for manual properties

## Solution Architecture

```text
┌──────────────────────────────────────────────────────────────────┐
│  GUEST BOOKING FLOW (No PMS Property)                            │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PropertyShowcase                                                │
│  ├── Load wizard rates from amenities.room_types                 │
│  ├── Assume availability = ∞ (always bookable)                   │
│  └── Display rates on RoomCollection cards                       │
│              ↓                                                   │
│  Booking.tsx                                                     │
│  ├── Calculate cost from amenities.room_types + seasons          │
│  ├── Guest pays via PayFast                                      │
│  └── push-booking triggered                                      │
│              ↓                                                   │
│  push-booking Edge Function                                      │
│  ├── No external_system → Skip PMS sync                          │
│  ├── Send guest confirmation email (existing)                    │
│  └── [NEW] Send property owner email notification                │
│              ↓                                                   │
│  Property Owner Receives Email                                   │
│  └── Full booking details to manually confirm room               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Technical Changes

### 1. PropertyShowcase.tsx - Load Wizard Rates for Non-PMS Properties

**Location**: `src/pages/PropertyShowcase.tsx`

When no PMS is connected, extract rates from `amenities.room_types` and create synthetic availability data:

```typescript
// In fetchPropertyData() - after checking PMS availability
if (!externalSystem) {
  // Build synthetic availability from wizard data
  const wizardRooms = property.amenities?.room_types || [];
  const syntheticAvailMap = new Map();
  
  wizardRooms.forEach((room) => {
    const roomId = room.id || room.room_type_id;
    syntheticAvailMap.set(roomId, {
      external_room_type_id: roomId,
      available_units: 99, // Unlimited availability
      rates: [{
        rate_type_id: 'wizard-rate',
        room_amount: room.base_rate || room.baseRate || room.daily_rate,
        price_type: (room.rate_unit || room.rateUnit) === 'per_stay' ? 'PerStay' : 'UnitRate',
      }],
      date: today,
    });
  });
  
  setAvailability(syntheticAvailMap);
}
```

**Also update** `getLowestRateForRoom()` to check wizard rates when no PMS rates exist:
```typescript
// After existing rate checks, add wizard fallback
if (lowest === null) {
  const wizardRoom = property?.amenities?.room_types?.find((rt: any) => 
    (rt.id || rt.room_type_id) === room.id
  );
  if (wizardRoom?.base_rate || wizardRoom?.baseRate) {
    lowest = wizardRoom.base_rate || wizardRoom.baseRate;
  }
}
```

### 2. Booking.tsx - Calculate Costs from Wizard Data

**Location**: `src/pages/Booking.tsx`

In `calculateCost()`, add handling for non-PMS properties using wizard rates:

```typescript
// In the else branch for "Other PMS systems or no PMS"
if (!externalSystem || externalSystem === 'none') {
  // Build synthetic availability from wizard room_types
  const wizardRooms = amenities?.room_types || [];
  const syntheticRoomTypes = wizardRooms.map((room: any) => ({
    room_type_id: room.id || room.room_type_id,
    room_type_name: room.name,
    rate_types: [{
      rate_type_id: 'wizard-rate',
      rate_type_name: 'Standard Rate',
      price_type: (room.rate_unit || room.rateUnit) === 'per_stay' ? 'PerStay' : 'UnitRate',
      rates: generateDailyRates(
        checkIn, 
        checkOut, 
        room.base_rate || room.baseRate, 
        amenities?.seasons,
        amenities?.season_rates
      ),
    }],
    rooms_available_per_night: generateAvailabilityArray(checkIn, checkOut, 99),
  }));
  
  availability = { room_types: syntheticRoomTypes };
} else {
  // Existing pms_availability_cache logic
}
```

Add helper functions:
```typescript
function generateDailyRates(checkIn, checkOut, baseRate, seasons, seasonRates) {
  // Generate per-day rates, applying season adjustments if defined
  const rates = [];
  let currentDate = new Date(checkIn);
  const endDate = new Date(checkOut);
  
  while (currentDate < endDate) {
    const dateStr = currentDate.toISOString().split('T')[0];
    const seasonRate = findSeasonRate(dateStr, seasons, seasonRates);
    rates.push({
      date: dateStr,
      room_amount: seasonRate?.roomAmount || baseRate,
    });
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return rates;
}
```

### 3. push-booking/index.ts - Property Owner Notification

**Location**: `supabase/functions/push-booking/index.ts`

After the current `if (!externalSystem)` early return, add property owner email:

```typescript
if (!externalSystem) {
  console.log('No external system configured for property - sending owner notification');
  
  // Mark as confirmed (no PMS to sync to)
  await supabaseClient
    .from('bookings')
    .update({ status: 'confirmed' })
    .eq('id', booking_id);
  
  // Send owner notification email
  const ownerEmail = property.owner_email;
  if (ownerEmail) {
    try {
      await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            booking_id,
            status: 'property_notification',
            recipient_email: ownerEmail,
          }),
        }
      );
      console.log('Property owner notification sent to:', ownerEmail);
    } catch (error) {
      console.error('Failed to send owner notification:', error);
    }
  }
  
  // Also send guest confirmation
  await fetch(
    `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-booking-email`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        booking_id,
        status: 'success',
      }),
    }
  );
  
  return new Response(
    JSON.stringify({ success: true, message: 'Booking confirmed, owner notified' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

### 4. send-booking-email/index.ts - Property Notification Template

**Location**: `supabase/functions/send-booking-email/index.ts`

Add new status type and handler:

```typescript
// Update request schema
const requestSchema = z.object({
  booking_id: z.string().uuid(),
  status: z.enum(["success", "failed", "admin_alert", "property_notification"]),
  error_message: z.string().optional(),
  sync_warning: z.string().optional(),
  recipient_email: z.string().email().optional(), // For property notifications
});

// Add property notification email generator
function generatePropertyNotificationEmail(booking: any, property: any): string {
  // Similar to admin_alert but addressed to property owner
  // Subject: "New Booking Received - [Guest Name] - [Dates]"
  // Body includes: guest details, dates, room type, payment confirmation, 
  // special requests, and call-to-action to confirm room
}

// In handler, add case
if (status === "property_notification") {
  const recipientEmail = body.recipient_email || property.owner_email;
  const html = generatePropertyNotificationEmail(booking, property);
  
  await resend.emails.send({
    from: fromEmail,
    to: [recipientEmail],
    subject: `New Booking Received - ${booking.guest_name} - ${formatDate(booking.check_in_date)} to ${formatDate(booking.check_out_date)}`,
    html,
  });
  
  return new Response(JSON.stringify({ success: true }), { headers });
}
```

### 5. Database Trigger Update (Optional Enhancement)

Update the `can_confirm_booking` trigger to allow confirmation for non-PMS properties:

The trigger already checks `is_rol_property = true`, which should be set for manually-managed properties. No changes needed if properties are correctly flagged.

## Property Owner Email Template

```html
Subject: New Booking Received - [Guest Name] - [Check-in Date] to [Check-out Date]

Body:
┌──────────────────────────────────────────────────────────────────┐
│  🎉 NEW BOOKING RECEIVED                                         │
│  A guest has booked a stay at [Property Name]                    │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BOOKING DETAILS                                                 │
│  Reference: [BOOKING-REF]                                        │
│  Check-in: [Date] | Check-out: [Date] | [X] nights               │
│  Room: [Room Type Name]                                          │
│  Guests: [X] adults, [X] children                                │
│                                                                  │
│  GUEST INFORMATION                                               │
│  Name: [Guest Name]                                              │
│  Email: [Guest Email]                                            │
│  Phone: [Guest Phone]                                            │
│                                                                  │
│  PAYMENT                                                         │
│  ✓ PAID: R[Amount] via PayFast                                   │
│  Transaction: [Payment Reference]                                │
│                                                                  │
│  SPECIAL REQUESTS                                                │
│  "[Special requests text]"                                       │
│                                                                  │
│  ─────────────────────────────────────────────────               │
│  Please ensure this room is reserved for the guest.              │
│  Contact guest directly if clarification needed.                 │
│                                                                  │
│  RoomsOnline on behalf of [Property Name]                        │
└──────────────────────────────────────────────────────────────────┘
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Add synthetic availability from wizard rates for non-PMS properties |
| `src/pages/Booking.tsx` | Calculate costs from wizard data when no PMS; add helper functions |
| `supabase/functions/push-booking/index.ts` | Replace early return with owner notification + guest email flow |
| `supabase/functions/send-booking-email/index.ts` | Add `property_notification` status handler and email template |

## Edge Cases Handled

1. **No owner_email**: Fall back to sending only guest email; log warning
2. **Seasons pricing**: Apply season-specific rates when calculating costs
3. **Missing base_rate**: Show "Contact for rates" in UI (existing behavior)
4. **PMS later connected**: Once a PMS is connected, wizard rates are replaced by PMS rates automatically

## Testing Checklist

- [ ] Non-PMS property shows rooms with wizard rates on PropertyShowcase
- [ ] Guest can select dates and see calculated price
- [ ] Payment flow completes successfully
- [ ] Guest receives confirmation email
- [ ] Property owner receives notification email with full booking details
- [ ] Booking appears in dashboard with status "confirmed"
