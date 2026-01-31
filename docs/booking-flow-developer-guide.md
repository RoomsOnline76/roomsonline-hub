# ROL Booking Flow: Developer Guide

> Complete technical documentation of the RoomsOnline booking journey from property discovery to confirmation.

## Table of Contents

1. [Flow Overview](#flow-overview)
2. [Architecture Principles](#architecture-principles)
3. [Step-by-Step Journey](#step-by-step-journey)
4. [State Management](#state-management)
5. [PMS Integration](#pms-integration)
6. [Payment Processing](#payment-processing)
7. [Post-Booking Actions](#post-booking-actions)
8. [Key Files Reference](#key-files-reference)
9. [Troubleshooting](#troubleshooting)

---

## Flow Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ROL UNIFIED JOURNEY FLOW                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐       │
│  │  PropertyShowcase │───▶│  QuickBookDrawer │───▶│  JourneyCheckout │       │
│  │  /property/:slug  │    │   (Slide-up)     │    │ /journey/checkout│       │
│  └──────────────────┘    └──────────────────┘    └──────────────────┘       │
│         │                        │                        │                  │
│         ▼                        ▼                        ▼                  │
│  • Browse property        • Confirm room          • Enter guest details     │
│  • Select dates           • Verify price          • Submit payment          │
│  • Set guest count        • Add to journey        • Receive confirmation    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### The 3-Step Journey

| Step | Component | Route | User Action |
|------|-----------|-------|-------------|
| 1 | PropertyShowcase | `/property/:slug` | Select dates + guests via FloatingDateGuestPicker |
| 2 | QuickBookDrawer | (overlay) | Confirm room, review price, click "Continue to Checkout" |
| 3 | JourneyCheckout | `/journey/checkout` | Enter details, pay, complete booking |

---

## Architecture Principles

### Core Rule: PMS is Authority

```
┌─────────────────────────────────────────────────────────────────┐
│  RULE #1: NO BOOKING FROM CACHE                                 │
│                                                                  │
│  All bookings MUST verify live availability with the connected  │
│  PMS immediately before creation. Cache is for display only.    │
└─────────────────────────────────────────────────────────────────┘
```

### Adapter Isolation Pattern

Each PMS has its own isolated edge function:

```
supabase/functions/
├── benson-api/          # Benson PMS adapter
├── hostfully-api/       # Hostfully adapter  
├── hotelbeds-api/       # HotelBeds adapter
├── checkfront-api/      # Checkfront adapter
├── nightsbridge-*       # NightsBridge adapters
└── push-booking/        # Universal booking orchestrator
```

### Data Flow

```
┌─────────────┐      ┌─────────────┐      ┌─────────────┐
│   Browser   │ ───▶ │ Edge Func   │ ───▶ │  External   │
│   (React)   │      │ (Adapter)   │      │    PMS      │
└─────────────┘      └─────────────┘      └─────────────┘
       │                    │                    │
       │                    ▼                    │
       │             ┌─────────────┐             │
       │             │  Supabase   │◀────────────┘
       │             │  Database   │   (sync results)
       │             └─────────────┘
       │                    │
       └────────────────────┘
            (read cache)
```

---

## Step-by-Step Journey

### Step 1: Property Showcase

**Route:** `/property/:slug`  
**Component:** `src/pages/PropertyShowcase.tsx`

#### What Happens:

1. Property data loads from `properties` table
2. Room types load from `hostfully_room_types` or `pms_room_types_cache`
3. `FloatingDateGuestPicker` appears at bottom of screen
4. User selects check-in/check-out dates
5. User adjusts guest count (adults, children, infants)
6. Dates sync to `MobileBookingContext`

#### Key Components:

```typescript
// FloatingDateGuestPicker.tsx
- Handles date selection with calendar UI
- Syncs to MobileBookingContext.setDates()
- Opens QuickBookDrawer on "Book Now" click

// MobileBookingContext.tsx  
- Global state for booking session
- Persists to sessionStorage
- Stores: propertyId, dates, rooms, guestDetails, totalCost
```

#### State at End of Step 1:

```typescript
MobileBookingContext.state = {
  propertyId: "uuid",
  propertyName: "Property Name",
  checkIn: "2024-03-15",
  checkOut: "2024-03-18",
  rooms: [],  // Not yet selected
  totalCost: 0,
}
```

---

### Step 2: QuickBookDrawer

**Component:** `src/components/booking/QuickBookDrawer.tsx`

#### What Happens:

1. Drawer slides up from bottom
2. Syncs dates from `MobileBookingContext` (useEffect on open)
3. Fetches room availability from PMS or cache
4. Displays available rooms with prices
5. User selects room (auto-selected if single room)
6. Price calculates based on nights × rate
7. User clicks "Continue to Checkout"
8. Stay added to `ItineraryContext`
9. Navigate to `/journey/checkout`

#### Date Sync Logic:

```typescript
// Sync dates when drawer opens
useEffect(() => {
  if (open && mobileBookingState.checkIn) {
    setCheckIn(new Date(mobileBookingState.checkIn));
    setCheckOut(new Date(mobileBookingState.checkOut));
  }
}, [open, mobileBookingState.checkIn, mobileBookingState.checkOut]);
```

#### Price Calculation:

```typescript
// Price sources by PMS type:
// - Hostfully: Live API call to hostfully-api
// - Benson/HotelBeds: pms_availability_cache table
// - Manual (none): property_availability table
```

#### Adding Stay to Journey:

```typescript
const handleContinueToCheckout = () => {
  addStay({
    property_id: propertyId,
    property_name: propertyName,
    property_slug: propertySlug,
    dates: { check_in, check_out },
    rooms: [{
      room_type_id: selectedRoomId,
      room_type_name: selectedRoom.name,
      quantity: 1,
      rate_per_night: pricePerNight,
      total_price: totalPrice,
    }],
    guests,
    price_breakdown: { subtotal, fees, taxes, total },
    nights,
  });
  
  navigate('/journey/checkout');
};
```

---

### Step 3: Journey Checkout

**Route:** `/journey/checkout`  
**Component:** `src/pages/JourneyCheckout.tsx`

#### What Happens:

1. Reads stays from `ItineraryContext`
2. Displays journey summary (properties, dates, totals)
3. Shows guest details form (name, email, phone)
4. Guest details are "sticky" (persist to localStorage)
5. Validates all required fields
6. On submit: calls `validate-itinerary-availability` edge function
7. If available: initiates payment via PayFast
8. On payment success: calls `multi-push-booking` edge function
9. On booking success: navigates to confirmation

#### Validation Flow:

```typescript
// Before payment - verify all stays are still available
const validateAvailability = async () => {
  const { data, error } = await supabase.functions.invoke(
    'validate-itinerary-availability',
    { body: { stays: itinerary.stays } }
  );
  
  if (error || !data.all_available) {
    // Show DateReselectDialog for unavailable stays
    return false;
  }
  return true;
};
```

#### Payment Flow:

```typescript
// Payment is REQUIRED before PMS push
// See "Payment Processing" section below
```

---

## State Management

### Three Context Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                     STATE ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  MobileBookingContext                                     │   │
│  │  - Current property selection                             │   │
│  │  - Active dates (check-in/check-out)                     │   │
│  │  - Guest counts                                           │   │
│  │  - Persists to: sessionStorage                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  ItineraryContext                                         │   │
│  │  - Multi-property journey (array of stays)               │   │
│  │  - Guest details (name, email, phone)                    │   │
│  │  - Total price across all stays                          │   │
│  │  - Persists to: sessionStorage + localStorage            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Database (Supabase)                                      │   │
│  │  - itineraries table (persisted journey)                 │   │
│  │  - itinerary_bookings (links to individual bookings)     │   │
│  │  - bookings table (final confirmed bookings)             │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### ItineraryContext Interface

```typescript
interface Stay {
  property_id: string;
  property_name: string;
  property_slug: string;
  property_image: string;
  external_system: string;  // 'benson' | 'hostfully' | 'nightsbridge' | 'none'
  dates: {
    check_in: string;  // YYYY-MM-DD
    check_out: string;
  };
  rooms: Array<{
    room_type_id: string;
    room_type_name: string;
    quantity: number;
    rate_per_night: number;
    total_price: number;
  }>;
  guests: {
    adults: number;
    children: number;
    infants: number;
  };
  price_breakdown: {
    subtotal: number;
    fees: Array<{ name: string; amount: number }>;
    taxes: Array<{ name: string; amount: number }>;
    total: number;
  };
  nights: number;
}

interface Itinerary {
  stays: Stay[];
  guest_details: {
    name: string;
    email: string;
    phone: string;
  };
  total_price: number;
  currency: string;
}
```

---

## PMS Integration

### Supported Systems

| PMS | Type | Capabilities | Adapter |
|-----|------|--------------|---------|
| Benson | Full | Availability, Rates, Bookings | `benson-api` |
| Hostfully | Full | Availability, Rates, Bookings, Rooms | `hostfully-api` |
| HotelBeds | Full | Availability, Rates, Bookings | `hotelbeds-api` |
| NightsBridge | External | Redirects to NB widget | `nightsbridge-*` |
| Checkfront | Partial | Availability, Bookings | `checkfront-api` |
| None (Manual) | Native | ROL manages availability | `push-booking` |

### Booking Push Flow

```typescript
// push-booking/index.ts orchestrates all PMS types

switch (property.external_system) {
  case 'benson':
    // Call benson-api to create reservation
    break;
    
  case 'hostfully':
    // Call hostfully-api to create reservation
    break;
    
  case 'hotelbeds':
    // Call hotelbeds-api to create reservation
    break;
    
  case 'none':
    // Manual property - block calendar in property_availability
    await blockCalendarDates(propertyId, checkIn, checkOut, roomType);
    break;
}
```

### Manual Property Calendar Blocking

For properties without external PMS (`external_system: 'none'`):

```typescript
// When booking confirms, block the dates
const availabilityRecords = dateRange.map(date => ({
  property_id: propertyId,
  date: format(date, 'yyyy-MM-dd'),
  room_type: roomType || 'default',
  available_units: 0,
  is_stop_sell: true,
  updated_at: new Date().toISOString(),
}));

await supabase
  .from('property_availability')
  .upsert(availabilityRecords, {
    onConflict: 'property_id,date,room_type',
  });
```

---

## Payment Processing

### Payment-First Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  RULE: Payment MUST succeed before PMS booking push            │
│                                                                  │
│  Guest confidence: If payment succeeds but PMS fails,           │
│  the booking is still treated as successful with a sync_warning │
└─────────────────────────────────────────────────────────────────┘
```

### PayFast Integration

```typescript
// JourneyCheckout.tsx
const handlePayment = async () => {
  // 1. Validate availability first
  const available = await validateAvailability();
  if (!available) return;
  
  // 2. Create pending booking record
  const { data: booking } = await supabase
    .from('bookings')
    .insert({
      property_id,
      check_in_date,
      check_out_date,
      guest_name,
      guest_email,
      total_price,
      status: 'pending',
      payment_status: 'pending',
    })
    .select()
    .single();
  
  // 3. Initiate PayFast payment
  // Opens PayFast modal/redirect
  await initiatePayFastPayment({
    booking_id: booking.id,
    amount: totalPrice,
    return_url: `/booking-confirmation/${booking.id}`,
  });
};
```

### Post-Payment Webhook

```typescript
// payfast-api/index.ts handles ITN (Instant Transaction Notification)

// 1. Verify payment signature
// 2. Update booking.payment_status = 'paid'
// 3. Call push-booking to sync with PMS
// 4. Send confirmation email via send-itinerary-email
```

---

## Post-Booking Actions

### Confirmation Email

**Edge Function:** `send-itinerary-email`

Sends:
- Guest confirmation with booking details
- PDF brochure attachment (generated via `generate-itinerary-pdf`)
- Property contact information

### Property Notification

**Edge Function:** `send-booking-email`

Notifies property owner of new booking with guest details.

### Sync Logging

All PMS sync operations logged to `sync_logs` table:

```typescript
await supabase.from('sync_logs').insert({
  property_id,
  sync_type: 'booking_push',
  external_system: property.external_system,
  status: 'success' | 'failed',
  details: { booking_id, external_reservation_id },
});
```

---

## Key Files Reference

### Frontend Components

| File | Purpose |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Property display, entry point |
| `src/components/booking/FloatingDateGuestPicker.tsx` | Date/guest selection UI |
| `src/components/booking/QuickBookDrawer.tsx` | Room selection, price confirmation |
| `src/pages/JourneyCheckout.tsx` | Guest details, payment |
| `src/pages/JourneyConfirmation.tsx` | Post-booking confirmation |
| `src/pages/BookingConfirmation.tsx` | Single booking confirmation |

### State Management

| File | Purpose |
|------|---------|
| `src/contexts/MobileBookingContext.tsx` | Current booking session |
| `src/contexts/ItineraryContext.tsx` | Multi-property journey |

### Edge Functions

| File | Purpose |
|------|---------|
| `supabase/functions/push-booking/` | Orchestrate booking to PMS |
| `supabase/functions/multi-push-booking/` | Multi-stay atomic booking |
| `supabase/functions/validate-itinerary-availability/` | Pre-booking availability check |
| `supabase/functions/send-itinerary-email/` | Confirmation email + PDF |
| `supabase/functions/payfast-api/` | Payment processing |

### Database Tables

| Table | Purpose |
|-------|---------|
| `bookings` | Confirmed booking records |
| `itineraries` | Multi-stay journey records |
| `itinerary_bookings` | Links itineraries to bookings |
| `property_availability` | Manual property calendar |
| `pms_availability_cache` | Cached PMS availability |
| `booking_sync_status` | PMS sync tracking |

---

## Troubleshooting

### Dates Not Syncing

**Symptom:** QuickBookDrawer shows default dates instead of selected dates

**Check:**
1. Is `MobileBookingContext` provider wrapped around the app?
2. Is `FloatingDateGuestPicker` calling `setDates()`?
3. Is QuickBookDrawer's `useEffect` triggering on `open`?

### Price Shows as 0

**Symptom:** Room price displays as R 0.00

**Check:**
1. For Hostfully: Is `hostfully-api` returning rates?
2. For cache-based: Is `pms_availability_cache` populated?
3. For manual: Is `property_availability` set up?

### Booking Fails After Payment

**Symptom:** Payment succeeds but booking shows as failed

**Check:**
1. Review `push-booking` edge function logs
2. Check `booking_sync_status` table for error
3. Verify PMS credentials in `api_keys` table

### Calendar Not Blocking

**Symptom:** Booked dates still show as available

**Check:**
1. Is property `external_system = 'none'`?
2. Check `property_availability` table for records
3. Verify `push-booking` upsert succeeded

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-31 | Initial documentation |

---

*This document is the authoritative reference for the ROL booking flow. Keep it updated with any architectural changes.*
