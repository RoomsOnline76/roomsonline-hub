

# Create Booking Flow Developer Documentation

## Overview

Create a comprehensive developer reference document that explains the complete user journey through the booking process, from landing on a property page to receiving booking confirmation.

---

## File to Create

**Location**: `docs/booking-flow.md`

---

## Document Structure

### 1. Flow Diagram (ASCII)

```text
User Journey: Property Discovery → Checkout → Confirmation

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  HOME (/)  ───►  PROPERTY SHOWCASE  ───►  ROOM SHOWCASE  ───►  BOOKING │
│                  /property/:slug         /property/:slug/    /booking/ │
│                                          room/:roomSlug      :slug     │
│                                                │                 │     │
│                                                │                 ▼     │
│                                                └──────────►  CONFIRMATION
│                                                               /booking- │
│                                                               confirmation
│                                                               /:bookingId
└─────────────────────────────────────────────────────────────────────────┘
```

### 2. Entry Points

Document the three main entry points:
- **Home Page** (`/`) - Property search and discovery
- **Property Showcase** (`/property/:slug`) - Property details with room collection
- **Direct Link** - Marketing campaigns linking directly to booking page

### 3. Step-by-Step User Journey

**Step 1: Property Showcase Page**
- Route: `/property/:slug`
- Component: `PropertyShowcase.tsx`
- User Actions:
  - View hero images/video
  - Read editorial content
  - Browse room collection
  - Click "Explore Rooms" or room card
- Key Components: `RunwayHero`, `RoomCollection`, `StickyBookingCTA`, `FloatingDateGuestPicker`
- Data Sources: `public_properties` view, `pms_availability_cache`

**Step 2: Room Selection Page**
- Route: `/property/:slug/room/:roomSlug`
- Component: `RoomShowcase.tsx`
- User Actions:
  - View room images gallery
  - See room details (beds, bathrooms, capacity)
  - Check rates and availability
  - Click "Book This Room" or "Check Availability"
- Key Components: Room hero gallery, rate display, availability calendar
- Data Sources: Room types from `amenities.room_types`, live rates from PMS APIs

**Step 3: Availability Calendar (for PMS properties)**
- Route: `/property/:slug/room/:roomSlug/availability`
- Component: `RoomAvailabilityCalendar.tsx`
- User Actions:
  - Select check-in date
  - Select check-out date
  - Choose rate type
  - Select guest counts (adults, teens, children, infants, pets)
  - Click "Add to Booking" / "Proceed to Checkout"
- Data Sources: Live availability from `benson-api`, `hostfully-api`, `hotelbeds-api`

**Step 4: Checkout Page**
- Route: `/booking/:slug`
- Component: `Booking.tsx`
- User Actions:
  - Review selected rooms
  - Enter guest details (name, email, phone)
  - Add special requests
  - View cost breakdown
  - Click "Confirm Booking"
- Key State:
  - `rooms[]` - Selected room bookings
  - `guestName`, `guestEmail`, `guestPhone` - Guest info (sticky via `ItineraryContext`)
  - `totalCost`, `costBreakdown[]` - Calculated pricing
- Validation: Zod schema for guest details

**Step 5: Booking Submission**
- Triggered by: "Confirm Booking" button click
- Process:
  1. Validate form fields
  2. Anonymous sign-in if no user (for RLS)
  3. Insert booking to `bookings` table
  4. Call `push-booking` edge function
  5. Push to PMS (Benson/Hostfully/HotelBeds/Checkfront)
  6. Send confirmation email via `send-booking-email`
- Error Handling:
  - `AVAILABILITY_CHANGED` → Show date re-selection dialog
  - Other errors → Show error toast

**Step 6: Confirmation Page**
- Route: `/booking-confirmation/:bookingId`
- Component: `BookingConfirmation.tsx`
- User Sees:
  - Success message with green checkmark
  - Reference number (8-char uppercase booking ID or external ref)
  - Booking summary (dates, guests, rooms)
  - "Return to Home" button
- Google Ads: Fires `gtag_report_conversion` on page load

### 4. PMS-Specific Flows

**NightsBridge Properties**
- Different flow: Iframe-based booking on property page
- No `/booking/:slug` page used
- Tracking via `nightsbridge_booking_sessions` table

**Benson/Hostfully/HotelBeds/Checkfront**
- Full internal flow through `/booking/:slug`
- Live availability verification (RULE #1)
- External reservation ID returned on success

### 5. State Management

Document key contexts:
- `ItineraryContext` - Sticky guest details, multi-property journey state
- `MobileBookingContext` - Current property selection
- `sessionStorage` - Multi-room booking state (`booking_state_${propertyId}`)

### 6. API Calls Timeline

```text
Timeline of API/Database Calls During Booking:

1. Page Load (Booking.tsx)
   └── Query: public_properties (property details)
   └── Query: pms_room_types_cache (room types)
   └── Query: pms_rate_types_cache (rate types)

2. Date Selection
   └── Invoke: benson-api/hostfully-api (fetch_availability)
   └── OR Query: pms_availability_cache

3. Cost Calculation
   └── Local calculation using availability data

4. Submit Booking
   └── Auth: signInAnonymously (if no user)
   └── Insert: bookings table
   └── Invoke: push-booking edge function
       └── Internal: Verify availability with PMS
       └── Internal: Create reservation in PMS
       └── Invoke: send-booking-email

5. Confirmation
   └── Query: bookings (with property join)
   └── Fire: gtag_report_conversion
```

### 7. Key Files Reference

| File | Purpose |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Property discovery and room browsing |
| `src/pages/RoomShowcase.tsx` | Individual room details and rates |
| `src/pages/RoomAvailability.tsx` | Date/guest selection calendar |
| `src/pages/Booking.tsx` | Checkout form and submission |
| `src/pages/BookingConfirmation.tsx` | Success page with tracking |
| `src/contexts/ItineraryContext.tsx` | Sticky guest details and journey state |
| `supabase/functions/push-booking/index.ts` | PMS booking integration |
| `supabase/functions/send-booking-email/index.ts` | Confirmation email |

### 8. Error States & Recovery

Document error handling for:
- Property not found
- Room not available
- Price calculation failures
- PMS push failures
- Network errors

---

## Technical Notes

- File will use Markdown format with code blocks
- Include ASCII diagrams for visual flow
- Reference actual line numbers for key functions
- Include URL patterns and query parameters

---

## Acceptance Criteria

- New developer can understand complete booking flow in 10 minutes
- All user interactions are documented with corresponding code locations
- PMS-specific variations are clearly explained
- State persistence mechanisms are documented
- Error handling flows are included

