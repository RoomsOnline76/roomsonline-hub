# RoomsOnline Booking Flow — Complete Developer Reference

> **Last Updated:** January 2026  
> **Audience:** Developers, Technical Architects  
> **Scope:** End-to-end booking journey from property discovery to confirmation

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [User Journey Flowchart](#user-journey-flowchart)
3. [Entry Points](#entry-points)
4. [State Management](#state-management)
5. [Room Selection & Pricing](#room-selection--pricing)
6. [The Journey System](#the-journey-system)
7. [Checkout Process](#checkout-process)
8. [Payment Flow (PayFast Onsite)](#payment-flow-payfast-onsite)
9. [Booking Creation & PMS Sync](#booking-creation--pms-sync)
10. [Confirmation & Post-Booking](#confirmation--post-booking)
11. [Error Handling](#error-handling)
12. [Database Schema](#database-schema)
13. [Edge Functions Reference](#edge-functions-reference)
14. [Feature Flags](#feature-flags)

---

## Architecture Overview

RoomsOnline uses a **PMS-agnostic booking engine** with four core principles:

| Principle | Description |
|-----------|-------------|
| **Isolation Layers** | Each PMS (Benson, Hostfully, HotelBeds, NightsBridge) has its own edge function |
| **Unified Data Model** | All bookings map to common `bookings` table regardless of source |
| **Agnostic UI** | Components use generic functions that route based on property config |
| **Payment-First** | PayFast payment must succeed before PMS sync is attempted |

### Supported PMS Integrations

| PMS | Edge Function | Booking Method |
|-----|---------------|----------------|
| Benson | `benson-api` | Direct API push |
| Hostfully | `hostfully-api` | OAuth v3 API |
| HotelBeds | `hotelbeds-api` | REST API |
| NightsBridge | External iframe | Redirect flow |
| Manual (ROL) | `push-booking` | Internal only |

---

## User Journey Flowchart

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ROOMSONLINE BOOKING FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

     ┌──────────┐
     │   HOME   │  Browse properties, search, filter
     │    /     │
     └────┬─────┘
          │
          ▼
┌──────────────────┐
│ PROPERTY SHOWCASE│  /property/:slug
│                  │  
│  ┌────────────┐  │
│  │ AI Concierge │◄── If AI_CONCIERGE_ENABLED flag is true
│  │   Panel    │  │   Natural language: "4 nights for 2 adults in March"
│  └─────┬──────┘  │
│        │ OR      │
│  ┌─────▼──────┐  │
│  │ Floating   │  │◄── Legacy: Date/Guest picker pill
│  │ DatePicker │  │
│  └─────┬──────┘  │
└────────┼─────────┘
         │
         ▼
┌──────────────────┐
│  QUICKBOOK       │  Slide-up drawer (embedded in PropertyShowcase)
│  DRAWER          │  
│                  │  • Room selection with live pricing
│  • Select Room   │  • Guest count steppers
│  • View Rates    │  • "Add to Journey" button
│  • Add to Cart   │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  JOURNEY REVIEW  │  /journey/review
│                  │  
│  • Timeline view │  Cinematic brochure-style review
│  • All stays     │  Multi-property support
│  • Total price   │
│  • [Checkout] ───┼──────────────────────────────┐
└──────────────────┘                              │
                                                  ▼
                                    ┌──────────────────────┐
                                    │   JOURNEY CHECKOUT   │  /journey/checkout
                                    │                      │
                                    │  ┌────────────────┐  │
                                    │  │ Guest Details  │  │  Name, Email, Phone
                                    │  │ Form           │  │
                                    │  └───────┬────────┘  │
                                    │          │           │
                                    │  ┌───────▼────────┐  │
                                    │  │ Special        │  │  Dietary, accessibility
                                    │  │ Requests       │  │
                                    │  └───────┬────────┘  │
                                    │          │           │
                                    │  ┌───────▼────────┐  │
                                    │  │ [Pay with      │  │  Triggers PayFast
                                    │  │  PayFast]      │  │
                                    │  └───────┬────────┘  │
                                    └──────────┼───────────┘
                                               │
                                               ▼
                              ┌─────────────────────────────────┐
                              │        PAYFAST ONSITE           │
                              │        (Modal Overlay)          │
                              │                                 │
                              │  • Card details entry           │
                              │  • 3D Secure verification       │
                              │  • Payment processing           │
                              └────────────────┬────────────────┘
                                               │
                         ┌─────────────────────┼─────────────────────┐
                         │                     │                     │
                         ▼                     ▼                     ▼
                    ┌─────────┐          ┌──────────┐          ┌──────────┐
                    │ SUCCESS │          │ CANCELLED│          │  FAILED  │
                    └────┬────┘          └────┬─────┘          └────┬─────┘
                         │                    │                     │
                         │                    ▼                     ▼
                         │              Return to             Show error,
                         │              checkout              retry option
                         ▼
              ┌───────────────────────┐
              │    ITN CALLBACK       │  PayFast → payfast-api edge function
              │    (Server-side)      │
              │                       │
              │  1. Validate payment  │
              │  2. Update booking    │
              │  3. Push to PMS ──────┼──► push-booking / multi-push-booking
              │  4. Send emails       │
              └───────────┬───────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │   CONFIRMATION PAGE   │  /journey/confirmation/:itineraryId
              │                       │
              │  • Success message    │
              │  • Timeline summary   │
              │  • Download brochure  │  AI poem, weather, voucher
              │  • Share journey      │
              └───────────────────────┘
```

---

## Entry Points

### 1. Standard Flow (Legacy)

**Components:** `FloatingDateGuestPicker` → `QuickBookDrawer`

```tsx
// PropertyShowcase.tsx
<FloatingDateGuestPicker
  onContinue={() => setQuickBookDrawerOpen(true)}
  ctaLabel="Check Rates"
  availabilityMap={calendarAvailability}
/>
```

### 2. AI Concierge Flow (New)

**Components:** `AIConciergePanel` → `SmartCart` → `InlineCheckout`

Enabled via `AI_CONCIERGE_ENABLED` feature flag.

```tsx
// PropertyShowcase.tsx
{aiConciergeEnabled ? (
  <AIConciergePanel
    propertyId={property.id}
    propertyName={property.name}
    roomTypes={roomTypes}
    onSuggestionSelected={handleSuggestionSelected}
  />
) : (
  <FloatingDateGuestPicker ... />
)}
```

### 3. Direct Room Access

Users can navigate directly to a room:
- `/property/:slug/room/:roomSlug` → `RoomShowcase`
- `/property/:slug/room/:roomSlug/availability` → `RoomAvailabilityCalendar`

---

## State Management

### Context Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    ItineraryContext                         │
│  • Multi-property journey state                             │
│  • stays[] array with all bookings                          │
│  • Guest details (sticky via localStorage)                  │
│  • Total price calculation                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ MobileBooking   │ │ CurrencyContext │ │ SearchContext   │
│ Context         │ │                 │ │                 │
│                 │ │ • Selected      │ │ • Search dates  │
│ • checkIn       │ │   currency      │ │ • Guest counts  │
│ • checkOut      │ │ • Exchange      │ │ • Filters       │
│ • guests        │ │   rates         │ │                 │
│ • selectedRoom  │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

### Key State Objects

#### ItineraryStay (single booking)

```typescript
interface ItineraryStay {
  id: string;
  property_id: string;
  property_name: string;
  property_slug: string;
  property_image?: string;
  room_id?: string;
  room_name: string;
  room_slug?: string;
  dates: {
    check_in: string;  // YYYY-MM-DD
    check_out: string;
  };
  nights: number;
  guests: {
    adults: number;
    children: number;
    infants: number;
    pets?: number;
  };
  price_breakdown: {
    per_night: number;
    subtotal: number;
    fees: { name: string; amount: number }[];
    total: number;
  };
  pms_config?: {
    external_system: string;
    rate_type_id?: string;
  };
}
```

### localStorage Persistence

| Key | Purpose |
|-----|---------|
| `rol_guest_details` | Sticky guest name, email, phone |
| `rol_itinerary` | Current journey state backup |
| `rol_currency` | Selected display currency |

---

## Room Selection & Pricing

### Price Calculation Strategy

The system uses a multi-stage fallback for accurate pricing:

```typescript
// Priority order for price calculation:
1. Live PMS API fetch (HotelBeds, Hostfully)
2. pms_availability_cache table
3. hostfully_room_types.daily_rate
4. property_rate_types table
5. Fallback: room_types.base_price
```

### Rate Type Mapping

| PMS | Rate Type Field | Example Value |
|-----|-----------------|---------------|
| Benson | `rate_type` | `standard`, `flexible` |
| Hostfully | `rate_type_id` | UUID from PMS |
| HotelBeds | `rateKey` | Encoded rate string |
| Manual | `rate_type_id` | `per-unit`, `per-night` |

### Availability Verification (RULE #1)

> **Critical:** All bookings MUST verify live availability with PMS before creation.

```typescript
// push-booking/index.ts
async function verifyAvailability(property, dates, roomId) {
  switch (property.external_system) {
    case 'benson':
      return await checkBensonAvailability(...)
    case 'hostfully':
      return await checkHostfullyAvailability(...)
    case 'hotelbeds':
      return await checkHotelbedsAvailability(...)
    default:
      return await checkManualAvailability(...)
  }
}
```

---

## The Journey System

### Multi-Property Support

RoomsOnline treats every booking as a "journey" that can contain multiple stays:

```typescript
// Example: 3-property Cape Town trip
const journey = {
  stays: [
    { property: "Camps Bay Villa", dates: "Mar 1-3", nights: 2 },
    { property: "Winelands Estate", dates: "Mar 3-5", nights: 2 },
    { property: "Hermanus Beach", dates: "Mar 5-7", nights: 2 }
  ],
  total_nights: 6,
  total_price: 45000
};
```

### Adding Stays

```typescript
// ItineraryContext
const addStay = (stay: ItineraryStay) => {
  setStays(prev => {
    // Check for duplicate property+dates
    const exists = prev.find(s => 
      s.property_id === stay.property_id && 
      s.dates.check_in === stay.dates.check_in
    );
    if (exists) {
      return prev.map(s => s.id === exists.id ? stay : s);
    }
    return [...prev, stay];
  });
};
```

### Journey Validation

Before checkout, the system validates:
1. No date overlaps between stays
2. All stays have valid pricing
3. Guest counts within room limits
4. PMS availability confirmed

---

## Checkout Process

### JourneyCheckout Component

**Route:** `/journey/checkout`

```tsx
// Key sections:
1. Order Summary (all stays with pricing)
2. Guest Details Form
   - Full name (required)
   - Email (required, validated)
   - Phone (required)
   - Country (for Hostfully)
3. Special Requests (optional textarea)
4. Pay Button → triggers PayFast
```

### Guest Detail Persistence

Guest info is "sticky" across sessions:

```typescript
// On blur, save to localStorage
const handleGuestBlur = () => {
  localStorage.setItem('rol_guest_details', JSON.stringify({
    name: guestName,
    email: guestEmail,
    phone: guestPhone
  }));
};
```

### Validation Before Payment

```typescript
const canProceed = useMemo(() => {
  return (
    guestName.trim().length > 0 &&
    isValidEmail(guestEmail) &&
    guestPhone.trim().length > 0 &&
    stays.length > 0 &&
    totalPrice > 0
  );
}, [guestName, guestEmail, guestPhone, stays, totalPrice]);
```

---

## Payment Flow (PayFast Onsite)

### Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend   │────▶│  payfast-api │────▶│   PayFast    │
│  (Checkout)  │     │ (Edge Func)  │     │   Servers    │
└──────────────┘     └──────────────┘     └──────────────┘
       │                                         │
       │                                         │
       ▼                                         ▼
┌──────────────┐                          ┌──────────────┐
│  PayFast     │◀─────────────────────────│  ITN Notify  │
│  Modal       │                          │  (Webhook)   │
└──────────────┘                          └──────────────┘
```

### Step-by-Step Flow

#### 1. Initiate Payment

```typescript
// JourneyCheckout.tsx
const handlePayment = async () => {
  // Create pending booking in database
  const booking = await createPendingBooking(stays, guestDetails);
  
  // Get PayFast UUID from edge function
  const { uuid } = await supabase.functions.invoke('payfast-api', {
    body: {
      action: 'create_onsite_payment',
      booking_id: booking.id,
      amount: totalPrice,
      item_name: `Journey: ${stays.map(s => s.property_name).join(', ')}`,
      email: guestEmail,
      name: guestName
    }
  });
  
  // Open PayFast modal
  setPayFastUUID(uuid);
  setShowPayFastModal(true);
};
```

#### 2. PayFast Modal

```tsx
// PayFastOnsiteModal.tsx
<Script src="https://www.payfast.co.za/onsite/engine.js" />

useEffect(() => {
  if (uuid) {
    window.payfast_do_onsite_payment({
      uuid: uuid,
      return_url: `${window.location.origin}/journey/confirmation/${itineraryId}`,
      cancel_url: window.location.href
    }, (result) => {
      if (result === true) {
        onSuccess();
      } else {
        onCancel();
      }
    });
  }
}, [uuid]);
```

#### 3. ITN Callback (Server-side)

```typescript
// payfast-api/index.ts (ITN handler)
if (action === 'itn_notify') {
  // Validate signature
  const isValid = validatePayFastSignature(body, passphrase);
  
  if (isValid && body.payment_status === 'COMPLETE') {
    // Update booking status
    await supabase
      .from('bookings')
      .update({ payment_status: 'paid', paid_at: new Date() })
      .eq('id', body.m_payment_id);
    
    // Push to PMS
    await pushBookingToPMS(bookingId);
    
    // Send confirmation email
    await sendConfirmationEmail(bookingId);
  }
}
```

### Payment Status Values

| Status | Meaning |
|--------|---------|
| `pending` | Payment initiated, awaiting completion |
| `paid` | Payment successful |
| `failed` | Payment declined or errored |
| `cancelled` | User cancelled payment |
| `refunded` | Payment refunded post-booking |

---

## Booking Creation & PMS Sync

### The push-booking Edge Function

**Purpose:** Creates booking in PMS after successful payment

```typescript
// push-booking/index.ts - Simplified flow
export async function pushBooking(bookingId: string) {
  // 1. Load booking data
  const booking = await loadBooking(bookingId);
  const property = await loadProperty(booking.property_id);
  
  // 2. RULE #1: Verify live availability
  const isAvailable = await verifyAvailability(property, booking);
  if (!isAvailable) {
    return { error: 'AVAILABILITY_CHANGED' };
  }
  
  // 3. Route to appropriate PMS
  let result;
  switch (property.external_system) {
    case 'benson':
      result = await pushToBenson(booking, property);
      break;
    case 'hostfully':
      result = await pushToHostfully(booking, property);
      break;
    case 'hotelbeds':
      result = await pushToHotelbeds(booking, property);
      break;
    default:
      result = await createManualBooking(booking, property);
  }
  
  // 4. Update booking with external reference
  if (result.success) {
    await supabase
      .from('bookings')
      .update({
        external_reservation_id: result.reservation_id,
        status: 'confirmed'
      })
      .eq('id', bookingId);
  }
  
  return result;
}
```

### PMS-Specific Payloads

#### Hostfully v3

```typescript
const hostfullyPayload = {
  propertyUid: property.hostfully_property_uid,
  checkInLocalDateTime: `${checkIn}T${checkInTime}:00`,
  checkOutLocalDateTime: `${checkOut}T${checkOutTime}:00`,
  status: 'NEW',
  source: 'HOSTFULLY_API',
  agencyUid: agencyUid,
  guestInformation: {
    firstName: guestFirstName,
    lastName: guestLastName,
    email: guestEmail,
    phoneNumber: guestPhone,
    countryCode: countryCode,
    adultCount: adults,
    childrenCount: children,
    infantCount: infants,
    petCount: pets
  }
};
```

#### Benson

```typescript
const bensonPayload = {
  room_type_id: roomTypeId,
  arrival: checkIn,
  departure: checkOut,
  guest_name: guestName,
  guest_email: guestEmail,
  guest_phone: guestPhone,
  adults: adults,
  children: children,
  rate_type: rateType,
  total_amount: totalPrice
};
```

### Manual Properties (No PMS)

For properties with `external_system: 'none'`:

1. Booking created directly in `bookings` table
2. Dates auto-blocked in `property_availability` table
3. No external sync required

```typescript
// Auto-block dates for manual properties
await supabase
  .from('property_availability')
  .upsert({
    property_id: propertyId,
    room_type_id: roomTypeId,
    date: dateRange,
    available_units: 0,
    is_stop_sell: true,
    reason: `Booking #${bookingId}`
  });
```

---

## Confirmation & Post-Booking

### JourneyConfirmation Page

**Route:** `/journey/confirmation/:itineraryId`

Displays:
- Success message with checkmark
- Timeline visualization of all stays
- Booking summary with pricing
- Guest details recap
- Download PDF brochure button
- Share journey button

### PDF Brochure Generation

The `generate-itinerary-pdf` edge function creates an enchanting PDF with:

1. **Personalized Cover** - Guest name, journey dates
2. **AI-Generated Poem** - 4-line personalized verse (Gemini AI)
3. **Weather Forecast** - 5-day forecast from Open-Meteo API
4. **Property Details** - Photos, descriptions, amenities
5. **Surprise Voucher** - 25% off local experience gift card

```typescript
// generate-itinerary-pdf/index.ts
const poem = await generatePoem(guestName, propertyNames, journeyTone);
const weather = await fetchWeather(latitude, longitude, checkIn, checkOut);
const voucher = await createVoucher(itineraryId);

const html = renderBrochureHTML({ poem, weather, voucher, stays });
```

### Confirmation Emails

Sent via `send-itinerary-email` edge function:
- Guest confirmation with PDF attachment
- Property owner notification
- ROL internal notification (admin)

---

## Error Handling

### Error Codes

| Code | Meaning | User Action |
|------|---------|-------------|
| `AVAILABILITY_CHANGED` | Room no longer available | Select new dates |
| `PMS_CONNECTION_ERROR` | Cannot reach PMS | Retry or contact support |
| `PAYMENT_FAILED` | PayFast declined | Retry with different card |
| `VALIDATION_ERROR` | Missing required fields | Complete form |
| `RATE_EXPIRED` | Quoted price no longer valid | Refresh and retry |

### DateReselectDialog

When `AVAILABILITY_CHANGED` occurs after payment:

```tsx
<DateReselectDialog
  open={showDateReselect}
  propertyName={property.name}
  originalDates={{ checkIn, checkOut }}
  onNewDatesSelected={(newDates) => {
    // Re-attempt booking with new dates
    retryBooking(newDates);
  }}
  onCancel={() => {
    // Process refund
    initiateRefund(bookingId);
  }}
/>
```

### Graceful Degradation

```typescript
// If payment succeeds but PMS sync fails
if (paymentSuccess && !pmsSuccess) {
  // Still show success to guest (they paid!)
  await updateBooking(bookingId, {
    status: 'confirmed',
    sync_warning: pmsError.message,
    requires_intervention: true
  });
  
  // Alert admin for manual intervention
  await notifyAdmin('PMS_SYNC_FAILED', bookingId);
}
```

---

## Database Schema

### Core Tables

```sql
-- Main bookings table
bookings (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties,
  room_type_id UUID,
  
  -- Dates
  check_in_date DATE,
  check_out_date DATE,
  
  -- Guests
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  adults INTEGER,
  children INTEGER,
  infants INTEGER,
  pets INTEGER,
  
  -- Pricing
  total_price NUMERIC,
  charges_breakdown JSONB,
  
  -- Status
  status TEXT, -- pending, confirmed, cancelled, completed
  payment_status TEXT,
  payment_reference TEXT,
  
  -- PMS
  external_reservation_id TEXT,
  booking_channel TEXT,
  
  -- Metadata
  special_requests TEXT,
  ai_metadata JSONB,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)

-- Journey/Itinerary tracking
itineraries (
  id UUID PRIMARY KEY,
  user_id UUID,
  session_id TEXT,
  
  -- Guest info
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  
  -- Journey data
  stays JSONB, -- Array of ItineraryStay objects
  total_nights INTEGER,
  total_price NUMERIC,
  currency TEXT DEFAULT 'ZAR',
  
  -- Status
  status TEXT, -- draft, pending, confirmed, expired
  
  -- Timestamps
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)

-- Links bookings to itineraries
itinerary_bookings (
  id UUID PRIMARY KEY,
  itinerary_id UUID REFERENCES itineraries,
  booking_id UUID REFERENCES bookings,
  stay_index INTEGER,
  status TEXT,
  external_reservation_id TEXT,
  error_message TEXT
)
```

### Availability Tables

```sql
-- PMS availability cache
pms_availability_cache (
  id UUID PRIMARY KEY,
  property_id UUID,
  room_type_id UUID,
  date DATE,
  available_units INTEGER,
  rate NUMERIC,
  rate_type TEXT,
  min_stay INTEGER,
  max_stay INTEGER,
  is_stop_sell BOOLEAN,
  fetched_at TIMESTAMPTZ,
  source TEXT -- 'hostfully', 'benson', 'hotelbeds'
)

-- Manual availability (for properties without PMS)
property_availability (
  id UUID PRIMARY KEY,
  property_id UUID,
  room_type_id UUID,
  date DATE,
  available_units INTEGER,
  is_stop_sell BOOLEAN,
  reason TEXT,
  created_at TIMESTAMPTZ
)
```

---

## Edge Functions Reference

| Function | Purpose | Trigger |
|----------|---------|---------|
| `payfast-api` | Payment initiation & ITN handling | Checkout, PayFast webhook |
| `push-booking` | Single booking PMS sync | Post-payment |
| `multi-push-booking` | Multi-property journey sync | Journey checkout |
| `validate-itinerary-availability` | Pre-checkout availability check | Before payment |
| `generate-itinerary-pdf` | PDF brochure creation | Confirmation page |
| `send-itinerary-email` | Confirmation emails | Post-booking |
| `ai-booking-concierge` | Natural language booking | AI Concierge panel |
| `hostfully-api` | Hostfully PMS operations | Various |
| `benson-api` | Benson PMS operations | Various |
| `hotelbeds-api` | HotelBeds operations | Various |

---

## Feature Flags

| Flag | Purpose | Default |
|------|---------|---------|
| `AI_CONCIERGE_ENABLED` | Enable AI booking concierge | `false` |
| `ROOMSONLINE_ACTIVE` | Master platform switch | `true` |
| `PAYFAST_SANDBOX` | Use PayFast sandbox mode | `false` |

Access via:
```typescript
const { data: flags } = useFeatureFlags();
const isAIEnabled = flags?.ai_concierge_enabled ?? false;
```

---

## Quick Reference: File Locations

| Component/Function | Path |
|--------------------|------|
| PropertyShowcase | `src/pages/PropertyShowcase.tsx` |
| FloatingDateGuestPicker | `src/components/booking/FloatingDateGuestPicker.tsx` |
| QuickBookDrawer | `src/components/booking/QuickBookDrawer.tsx` |
| AIConciergePanel | `src/components/booking/AIConciergePanel.tsx` |
| SmartCart | `src/components/booking/SmartCart.tsx` |
| InlineCheckout | `src/components/booking/InlineCheckout.tsx` |
| JourneyCheckout | `src/pages/JourneyCheckout.tsx` |
| JourneyConfirmation | `src/pages/JourneyConfirmation.tsx` |
| PayFastOnsiteModal | `src/components/booking/PayFastOnsiteModal.tsx` |
| ItineraryContext | `src/contexts/ItineraryContext.tsx` |
| MobileBookingContext | `src/contexts/MobileBookingContext.tsx` |
| push-booking | `supabase/functions/push-booking/index.ts` |
| multi-push-booking | `supabase/functions/multi-push-booking/index.ts` |
| payfast-api | `supabase/functions/payfast-api/index.ts` |
| ai-booking-concierge | `supabase/functions/ai-booking-concierge/index.ts` |
| generate-itinerary-pdf | `supabase/functions/generate-itinerary-pdf/index.ts` |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial complete documentation |
| - | - | Added AI Concierge flow |
| - | - | Added enchanting PDF brochure system |

---

*For questions or updates, contact the ROL development team.*
