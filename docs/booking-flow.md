# Booking Flow - Developer Reference

> **Quick Overview**: This document explains the complete user journey from property discovery to booking confirmation. A new developer should understand the full flow in ~10 minutes.

---

## Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                                         │
│  HOME (/)  ───►  PROPERTY SHOWCASE  ───►  ROOM SHOWCASE  ───►  AVAILABILITY  ───►  BOOKING
│                  /property/:slug         /property/:slug/      /property/:slug/   /booking/:slug
│                                          room/:roomSlug        room/:roomSlug/
│                                                                availability
│                                                                      │
│                                                                      ▼
│                                                               CONFIRMATION
│                                                               /booking-confirmation/:bookingId
│                                                                                         │
│  ┌─────────────────────────────────────────────────────────────────────────────────┐   │
│  │ ALTERNATIVE: NightsBridge Properties                                             │   │
│  │ PropertyShowcase → Embedded Iframe Booking (no /booking/:slug page)              │   │
│  └─────────────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Entry Points

| Entry Point | Route | Use Case |
|-------------|-------|----------|
| Home Page | `/` | Organic discovery via search/browse |
| Property Showcase | `/property/:slug` | Direct link to property |
| Booking Page | `/booking/:slug` | Marketing campaigns, retargeting |
| Room Availability | `/property/:slug/room/:roomSlug/availability` | Deep link to specific room |

---

## Step-by-Step User Journey

### Step 1: Property Showcase Page

**Route**: `/property/:slug`  
**Component**: `src/pages/PropertyShowcase.tsx`

**What the user sees**:
- Full-viewport hero with property images/video
- Editorial description and property facts
- Room collection gallery
- Sticky booking CTA bar

**User Actions**:
1. Scroll through property content
2. Click room card → navigates to Room Showcase
3. Click "Explore Rooms" → scrolls to room collection
4. Use floating date/guest picker for availability check

**Key Components**:
```text
PropertyShowcase.tsx
├── RunwayHero.tsx              # Hero section with media
├── QuietFacts.tsx              # Property quick facts
├── RoomCollection.tsx          # Grid of room cards
├── StickyBookingCTA.tsx        # Fixed bottom bar
└── FloatingDateGuestPicker.tsx # Date/guest selector overlay
```

**Data Sources**:
- `public_properties` view - Property details
- `pms_availability_cache` - Cached availability
- `amenities.room_types` - Room type definitions

---

### Step 2: Room Showcase Page

**Route**: `/property/:slug/room/:roomSlug`  
**Component**: `src/pages/RoomShowcase.tsx`

**What the user sees**:
- Room image gallery
- Room details (beds, bathrooms, capacity, size)
- Rate information (if available)
- "Check Availability" or "Book This Room" CTA

**User Actions**:
1. Browse room images
2. Review room amenities and details
3. Click "Check Availability" → Room Availability page
4. Click "Book Now" (if dates pre-selected) → Checkout

**Key Data**:
```typescript
// Room data from amenities.room_types array
interface RoomType {
  id: string;
  name: string;
  pmsRoomId?: string;
  description?: string;
  maxGuests?: number;
  bedrooms?: number;
  bathrooms?: number;
  images?: string[];
  rate?: number;
}
```

---

### Step 3: Room Availability Calendar

**Route**: `/property/:slug/room/:roomSlug/availability`  
**Component**: `src/pages/RoomAvailability.tsx` → `src/components/RoomAvailabilityCalendar.tsx`

**What the user sees**:
- Interactive date picker calendar
- Rate type selection (if multiple)
- Guest count steppers (adults, teens, children, infants, pets)
- Live pricing calculation
- "Add to Booking" button

**User Actions**:
1. Select check-in date
2. Select check-out date
3. Choose rate type (if applicable)
4. Adjust guest counts
5. Click "Add to Booking" → Checkout page

**State Persistence**:
```typescript
// Stored in sessionStorage as `booking_state_${propertyId}`
interface BookingState {
  rooms: RoomBooking[];
  totalCost: number;
  currency: string;
}

interface RoomBooking {
  roomTypeId: string;
  roomTypeName: string;
  checkIn: string;      // YYYY-MM-DD
  checkOut: string;
  numberOfAdults: number;
  numberOfTeens: number;
  numberOfChildren: number;
  numberOfInfants: number;
  numberOfPets: number;
  rateTypeId?: string;
  rateTypeName?: string;
  totalCost: number;
  costBreakdown: CostBreakdownItem[];
}
```

**PMS API Calls**:
```typescript
// Live availability fetch (varies by PMS)
await supabase.functions.invoke('benson-api', {
  body: { action: 'fetch_availability', property_id, room_id, check_in, check_out }
});

await supabase.functions.invoke('hostfully-api', {
  body: { action: 'get_rates', property_id, room_id, start_date, end_date }
});
```

---

### Step 4: Checkout Page

**Route**: `/booking/:slug`  
**Component**: `src/pages/Booking.tsx`

**What the user sees**:
- Selected rooms summary with dates
- Guest details form (name, email, phone)
- Special requests textarea
- Cost breakdown:
  - Accommodation subtotal
  - Taxes (from property_charges)
  - Fees (from property_charges)
  - Refundable deposits (highlighted)
  - Total due
- "Confirm Booking" button

**User Actions**:
1. Review selected rooms
2. Enter guest details (sticky via ItineraryContext)
3. Add special requests (optional)
4. Review final total
5. Click "Confirm Booking"

**Form Validation** (Zod schema):
```typescript
const guestSchema = z.object({
  guestName: z.string().min(2, "Name required"),
  guestEmail: z.string().email("Valid email required"),
  guestPhone: z.string().optional(),
  specialRequests: z.string().optional(),
});
```

**State Management**:
```typescript
// ItineraryContext provides sticky guest details
const { guestDetails, setGuestDetails } = useItinerary();

// Guest details persist in localStorage as 'rol_guest_details'
// Synced on input blur for seamless multi-session experience
```

**Cost Calculation Flow**:
```typescript
// 1. Get accommodation subtotal from room selections
const accommodationTotal = rooms.reduce((sum, room) => sum + room.totalCost, 0);

// 2. Fetch and calculate property charges
const { data: charges } = await supabase
  .from('property_charges')
  .select('*')
  .eq('property_id', propertyId)
  .eq('is_active', true);

// 3. Calculate charges using ChargeCalculator
const calculatedCharges = calculateCharges(charges, {
  subtotal: accommodationTotal,
  nights: totalNights,
  rooms: rooms.length,
  adults: totalAdults,
  children: totalChildren,
  infants: totalInfants,
});

// 4. Sum for final total
const grandTotal = accommodationTotal + calculatedCharges.total;
```

---

### Step 5: Booking Submission

**Triggered by**: "Confirm Booking" button click  
**Handler**: `handleBookingSubmit()` in `Booking.tsx`

**Submission Flow**:

```text
1. Validate form fields
   └── Zod validation for guest details
   └── Check rooms[] not empty

2. Anonymous sign-in (if no user)
   └── supabase.auth.signInAnonymously()
   └── Required for RLS policies on bookings table

3. Insert booking to database
   └── INSERT INTO bookings (property_id, guest_*, rooms, total_price, charges_breakdown, ...)
   └── Returns booking.id

4. Call push-booking edge function
   └── Verify availability with PMS (RULE #1)
   └── Create reservation in external PMS
   └── Returns external_reservation_id

5. Update booking with external reference
   └── UPDATE bookings SET external_reservation_id, status = 'confirmed'

6. Send confirmation email
   └── Invoke send-booking-email edge function

7. Navigate to confirmation page
   └── /booking-confirmation/:bookingId?ref=:externalRef
```

**Key Code** (`Booking.tsx`):
```typescript
const handleBookingSubmit = async () => {
  // 1. Validate
  const validation = guestSchema.safeParse({ guestName, guestEmail, ... });
  if (!validation.success) { /* show errors */ return; }

  // 2. Anonymous auth if needed
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    await supabase.auth.signInAnonymously();
  }

  // 3. Insert booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      property_id: property.id,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      check_in_date: rooms[0].checkIn,
      check_out_date: rooms[rooms.length - 1].checkOut,
      adults: totalAdults,
      children: totalChildren,
      teens: totalTeens,
      infants: totalInfants,
      pets: totalPets,
      rooms: rooms,
      total_price: grandTotal,
      charges_breakdown: chargesSnapshot,
      special_requests: specialRequests,
      status: 'pending',
    })
    .select()
    .single();

  // 4. Push to PMS
  const { data: pushResult, error: pushError } = await supabase.functions.invoke('push-booking', {
    body: { bookingId: booking.id }
  });

  if (pushError?.error_code === 'AVAILABILITY_CHANGED') {
    // Show date re-selection dialog
    setShowDateReselectDialog(true);
    return;
  }

  // 5. Navigate to confirmation
  navigate(`/booking-confirmation/${booking.id}?ref=${pushResult.external_reservation_id}`);
};
```

---

### Step 6: Confirmation Page

**Route**: `/booking-confirmation/:bookingId`  
**Component**: `src/pages/BookingConfirmation.tsx`

**What the user sees**:
- Green checkmark success icon
- "Reservation Submitted!" heading
- Property name
- Reference number (8-char uppercase from booking ID or external ref)
- Booking summary:
  - Check-in / Check-out dates
  - Guest count
  - Room details (if multi-room)
- "Return to Home" button

**Reference Number Logic**:
```typescript
// Priority: URL param > external_reservation_id > booking ID prefix
const displayRef = searchParams.get("ref") 
  || booking.external_reservation_id 
  || bookingId?.slice(0, 8).toUpperCase();
```

**Google Ads Conversion Tracking**:
```typescript
useEffect(() => {
  if (booking && typeof window.gtag_report_conversion === 'function') {
    window.gtag_report_conversion();
  }
}, [booking]);
```

---

## PMS-Specific Flows

### NightsBridge Properties

NightsBridge uses an **iframe-based booking widget** instead of our internal checkout flow.

**Flow**:
```text
PropertyShowcase → Embedded NightsBridge iframe → External booking
```

**Tracking**:
```typescript
// Create tracking session before iframe loads
const { createBookingSession } = useNightsBridgeTracking();
const trackingRef = await createBookingSession({
  propertyId,
  propertyName,
  checkIn,
  checkOut,
  currency,
});

// Iframe URL includes tracking ref
const iframeUrl = getNightsBridgeBookingUrl(
  bbid,           // NightsBridge property ID
  'SAI25',        // Agent code
  checkIn,
  checkOut,
  currency,
  trackingRef     // For attribution
);
```

**Session Matching**:
- `nightsbridge_booking_sessions` table stores session data
- `nightsbridge-reservations-sync` edge function matches sessions to actual bookings
- Match confidence: high (single session) / medium (date consistency) / low (probabilistic)

### Benson / Hostfully / HotelBeds / Checkfront

Full internal flow through `/booking/:slug` with PMS-specific push logic.

**Key Difference**: All verify availability with PMS before creating reservation (RULE #1).

```typescript
// push-booking edge function (simplified)
switch (externalSystem) {
  case 'benson':
    // Verify availability
    const avail = await checkBensonAvailability(params);
    if (!avail.available) throw { error_code: 'AVAILABILITY_CHANGED' };
    // Create reservation
    const result = await createBensonBooking(params);
    return { external_reservation_id: result.reservationId };

  case 'hostfully':
    // Similar flow with Hostfully v3 API
    // Uses checkInLocalDateTime/checkOutLocalDateTime format
    // Guest details in guestInformation object

  case 'hotelbeds':
    // Production: Live CheckRate verification
    // Staging: Mock success (sandbox is read-only)
}
```

---

## State Management

### ItineraryContext

**Purpose**: Sticky guest details and multi-property journey state

**File**: `src/contexts/ItineraryContext.tsx`

```typescript
interface ItineraryContextType {
  guestDetails: {
    name: string;
    email: string;
    phone: string;
  };
  setGuestDetails: (details: GuestDetails) => void;
  stays: Stay[];              // Multi-property journey
  addStay: (stay: Stay) => void;
  removeStay: (index: number) => void;
  clearItinerary: () => void;
}
```

**Persistence**: `localStorage` key `rol_guest_details`

### MobileBookingContext

**Purpose**: Current property selection for mobile booking flow

**File**: `src/contexts/MobileBookingContext.tsx`

### sessionStorage Booking State

**Purpose**: Multi-room selections for a single property

**Key**: `booking_state_${propertyId}`

**Structure**: See `BookingState` interface in Step 3 above

---

## API/Database Calls Timeline

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ CHECKOUT PAGE LOAD                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Query: public_properties                                                 │
│    SELECT * FROM public_properties WHERE slug = :slug                       │
│                                                                             │
│ 2. Query: property_charges (for cost calculation)                           │
│    SELECT * FROM property_charges WHERE property_id = :id AND is_active     │
│                                                                             │
│ 3. Load from sessionStorage: booking_state_${propertyId}                    │
│    Contains rooms[], totalCost, currency                                    │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ BOOKING SUBMISSION                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Auth: signInAnonymously (if no user)                                     │
│                                                                             │
│ 2. Insert: bookings table                                                   │
│    INSERT INTO bookings (...) RETURNING id                                  │
│                                                                             │
│ 3. Invoke: push-booking edge function                                       │
│    ├── Verify availability with PMS (RULE #1)                               │
│    ├── Create reservation in PMS                                            │
│    ├── Update booking.external_reservation_id                               │
│    └── Invoke: send-booking-email                                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ CONFIRMATION PAGE LOAD                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│ 1. Query: bookings with property join                                       │
│    SELECT *, properties(name, city, country, slug)                          │
│    FROM bookings WHERE id = :bookingId                                      │
│                                                                             │
│ 2. Fire: gtag_report_conversion() for Google Ads                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Property discovery page with editorial content |
| `src/pages/RoomShowcase.tsx` | Individual room details and booking CTA |
| `src/pages/RoomAvailability.tsx` | Wrapper for availability calendar |
| `src/components/RoomAvailabilityCalendar.tsx` | Date/guest selection with live rates |
| `src/pages/Booking.tsx` | **Main checkout page** - form, calculation, submission |
| `src/pages/BookingConfirmation.tsx` | Success page with tracking |
| `src/contexts/ItineraryContext.tsx` | Sticky guest details across sessions |
| `src/hooks/useNightsBridgeTracking.ts` | NightsBridge iframe session tracking |
| `src/lib/config.ts` | URL generators (getBookingUrl, getNightsBridgeBookingUrl) |
| `src/components/charges/ChargeCalculator.ts` | Tax/fee/deposit calculation logic |
| `supabase/functions/push-booking/index.ts` | PMS booking integration |
| `supabase/functions/send-booking-email/index.ts` | Confirmation email delivery |

---

## Error States & Recovery

### Property Not Found
- **Location**: PropertyShowcase.tsx, Booking.tsx
- **UI**: "Property Not Found" message with "Return Home" button
- **Trigger**: Invalid slug or inactive property

### Room Not Available (AVAILABILITY_CHANGED)
- **Location**: Booking.tsx submission handler
- **UI**: `DateReselectDialog` modal
- **Recovery**: User selects new dates, recalculates, resubmits

### Price Calculation Failure
- **Location**: RoomAvailabilityCalendar.tsx
- **UI**: Toast error, fallback to cached rates
- **Recovery**: Retry button, manual refresh

### PMS Push Failure
- **Location**: push-booking edge function
- **UI**: Error toast with message from PMS
- **Database**: Booking marked as `status: 'failed'`
- **Recovery**: Admin intervention or retry

### Network Error
- **Location**: Any API call
- **UI**: Toast with retry suggestion
- **Recovery**: User retries action

---

## Additional Charges Integration

The checkout page integrates with the `property_charges` system for transparent pricing.

**Categories displayed**:
- **TAXES**: VAT, Tourism Levy, etc.
- **FEES**: Cleaning, Resort Fee, etc.
- **DEPOSITS** (highlighted green): Security Deposit, etc. (with refund timing)
- **SURCHARGES**: Extra Guest Fee, Pet Fee, etc.

**Calculation**:
```typescript
import { calculateCharges, groupChargesByCategory, getTotals } from '@/components/charges/ChargeCalculator';

const calculated = calculateCharges(propertyCharges, {
  subtotal: accommodationTotal,
  nights,
  rooms: rooms.length,
  adults,
  children,
  infants,
});

const grouped = groupChargesByCategory(calculated);
const totals = getTotals(calculated);
```

**Snapshot on Confirmation**:
Charges are frozen in `bookings.charges_breakdown` at booking time for immutability.

---

## Testing Checklist

When testing the booking flow:

- [ ] Property loads correctly from slug
- [ ] Room selection persists in sessionStorage
- [ ] Date picker shows availability correctly
- [ ] Guest counts respect min/max limits
- [ ] Cost breakdown shows all applicable charges
- [ ] Guest details persist across sessions (ItineraryContext)
- [ ] Anonymous auth works for guest checkout
- [ ] PMS receives correct booking payload
- [ ] Confirmation page shows correct reference
- [ ] Email confirmation is sent
- [ ] Google Ads conversion fires

---

## Quick Debugging Tips

1. **Booking not appearing**: Check `bookings` table, verify `user_id` is set (RLS)
2. **Cost calculation wrong**: Check `property_charges` for the property
3. **PMS push failing**: Check edge function logs for `push-booking`
4. **Guest details not sticky**: Check localStorage `rol_guest_details`
5. **NightsBridge tracking**: Check `nightsbridge_booking_sessions` table
