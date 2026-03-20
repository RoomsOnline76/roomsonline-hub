# RoomsOnline Booking Flow — Developer Reference

> **Version:** 3.0  
> **Last Updated:** March 2026  
> **Audience:** Developers, Technical Architects  
> **Authority:** Single source of truth for the end-to-end booking system.

---

## Table of Contents

1. [Architecture Principles](#1-architecture-principles)
2. [End-to-End Flow](#2-end-to-end-flow)
3. [Property Showcase Page](#3-property-showcase-page)
4. [AI Concierge Panel](#4-ai-concierge-panel)
5. [Smart Cart](#5-smart-cart)
6. [Inline Checkout](#6-inline-checkout)
7. [Payment Processing (PayFast)](#7-payment-processing-payfast)
8. [Post-Payment Backend Pipeline](#8-post-payment-backend-pipeline)
9. [Email Notifications](#9-email-notifications)
10. [Confirmation Page](#10-confirmation-page)
11. [PDF Brochure Generation](#11-pdf-brochure-generation)
12. [State Management](#12-state-management)
13. [PMS Integration](#13-pms-integration)
14. [Database Schema](#14-database-schema)
15. [Edge Functions](#15-edge-functions)
16. [Feature Flags](#16-feature-flags)
17. [Error Handling](#17-error-handling)
18. [File Reference](#18-file-reference)
19. [Troubleshooting](#19-troubleshooting)

---

## 1. Architecture Principles

### Single Flow Mandate

```
┌─────────────────────────────────────────────────────────────────┐
│                    ONE BOOKING FLOW                             │
│                                                                 │
│   AI Concierge → Smart Cart → Inline Checkout → Payment → Done  │
│                                                                 │
│   No alternatives. No legacy fallbacks for users.               │
└─────────────────────────────────────────────────────────────────┘
```

| Principle | Implementation |
|-----------|----------------|
| **AI-First** | Natural language and voice input are the primary interaction mode |
| **Single Page** | Entire booking happens on `/property/:slug` — no page navigation until confirmation |
| **Payment-First** | PayFast must succeed before any PMS sync occurs |
| **PMS-Agnostic** | Benson, Hostfully, HotelBeds, NightsBridge — all use the same UI |
| **Graceful Degradation** | If AI fails, show error state with contact info — never reveal legacy components |

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

## 2. End-to-End Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              BOOKING FLOW                                    │
└──────────────────────────────────────────────────────────────────────────────┘

    ┌─────────┐
    │  HOME   │  User browses properties
    └────┬────┘
         │
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    PROPERTY SHOWCASE PAGE                                │
    │                    /property/:slug                                       │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │  AI CONCIERGE PANEL (bottom-right, persistent)                   │   │
    │  │  Collapsed: ✨ floating orb · Expanded: chat + suggestion cards  │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │  SMART CART (bottom sticky bar — appears when items added)        │   │
    │  │  [Room] · [Dates] · [Guests] · [Price]          [Checkout →]     │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    │                                                                          │
    │  ┌──────────────────────────────────────────────────────────────────┐   │
    │  │  INLINE CHECKOUT (accordion, expands above Smart Cart)           │   │
    │  │  Order Summary → Guest Details → Special Requests → [Pay Now]    │   │
    │  └──────────────────────────────────────────────────────────────────┘   │
    └─────────────────────────────────────────────────────────────────────────┘
         │
         │ Click "Pay Now"
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │  PAYFAST MODAL (overlay on page)                                        │
    │  User enters card details → PayFast processes → Success / Cancel        │
    └─────────────────────────────────────────────────────────────────────────┘
         │
         │ Payment Success → Frontend navigates immediately
         │ PayFast ITN callback → Backend pipeline (async)
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │  BACKEND PIPELINE (invisible to user)                                   │
    │                                                                          │
    │  1. payfast-api: ITN received → booking.payment_status = 'paid'         │
    │  2. push-booking: verify availability → create PMS reservation          │
    │  3. send-booking-email: guest confirmation (+ brochure attachment)       │
    │  4. send-booking-email: property owner notification (non-PMS only)       │
    │  5. send-booking-email: admin alert (if PMS sync fails)                 │
    └─────────────────────────────────────────────────────────────────────────┘
         │
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │  CONFIRMATION PAGE                                                      │
    │  /journey/confirmation/:id  OR  /booking-confirmation/:bookingId        │
    │                                                                          │
    │  ✓ Booking confirmed · Reference · Itinerary · Payment status           │
    └─────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Narrative

1. **User arrives at Property Showcase** (`/property/:slug`) — hero, description, rooms, amenities displayed. AI Concierge orb appears bottom-right.
2. **User interacts with AI Concierge** — types or speaks query (e.g. "2 adults, 4 nights in March"). AI parses, calls PMS for live availability, returns suggestion cards.
3. **User selects from suggestions** — "Add to Cart" on suggestion card.
4. **Smart Cart appears** — sticky bar shows selected room(s), total price, "Checkout" button.
5. **Inline Checkout expands** — accordion with order summary, guest form (name, email, phone), special requests, "Pay Now" button.
6. **PayFast Modal** — secure payment form overlays page. No navigation.
7. **Payment success** — frontend navigates to confirmation page. Backend processes PMS sync and emails asynchronously.

---

## 3. Property Showcase Page

**Route:** `/property/:slug`  
**Component:** `src/pages/PropertyShowcase.tsx`

What loads:
- Property data from `properties` table
- Room types from `hostfully_room_types` or `pms_room_types_cache`
- AI Concierge Panel (persistent, bottom-right)
- Dates sync to `MobileBookingContext`

### Visibility Rules

| Component | Visible When |
|-----------|-------------|
| AI Concierge compact strip (Dates \| Guests \| Book Now) | No items in cart (`hasStays = false`) |
| Smart Cart | Items in cart (`hasStays = true`) |
| Legacy StickyBookingCTA | Never (hidden when AI Concierge active) |

---

## 4. AI Concierge Panel

**Component:** `src/components/booking/AIConciergePanel.tsx`

### States

- **Collapsed:** Floating ✨ orb, bottom-right. Pulses gently. Label: "AI Travel Concierge"
- **Expanded:** Chat interface with message history, voice input (🎤), suggestion cards with "Add to Cart"

### Natural Language Understanding

| User Says | AI Extracts |
|-----------|-------------|
| "2 adults, 4 nights starting March 15" | adults: 2, nights: 4, check_in: 2026-03-15 |
| "romantic weekend for 2" | adults: 2, nights: 2, vibe: romantic, dates: next weekend |
| "family trip with 2 kids in April" | adults: 2, children: 2, month: April |
| "cheapest option for next week" | dates: next 7 days, sort: price_asc |

### Voice Input

- **Technology:** Web Speech API (browser-native)
- **Component:** `src/components/booking/VoiceInputButton.tsx`
- **Fallback:** Text input always available

### Proactive Suggestions

| Trigger | Suggestion |
|---------|------------|
| User inactive 8s after viewing rooms | "I notice you're looking at the Deluxe Suite. Would you like me to check availability?" |
| User adds basic room | Upgrade suggestion |
| User selects dates near event | Event alert |
| User hesitates on price | Value highlighting |

### Suggestion Card Interface

```typescript
interface SuggestionCard {
  room_type_id: string;
  room_name: string;
  check_in: string;
  check_out: string;
  nights: number;
  adults: number;
  children: number;
  price_per_night: number;
  total_price: number;
  currency: string;
  value_badges: string[];    // e.g. ["Best Value", "Last Room"]
  upsell_note?: string;
}
```

### Edge Function: `ai-booking-concierge`

```typescript
// Request
{
  action: "parse_request",
  property_id: "uuid",
  message: "2 adults for 4 nights in March",
  session_id: "uuid",
  context: { previous_messages: [...], selected_dates: null, selected_room: null }
}

// Response
{
  success: true,
  parsed: { adults: 2, children: 0, nights: 4, month: "March", year: 2026 },
  suggestions: [
    { type: "room_option", room_type_id: "uuid", room_name: "Deluxe Suite", dates: {...}, price: 4500, badges: ["Best Value"], available: true },
    { type: "alternative", room_name: "Ocean View Suite", price: 6200, badges: ["Upgrade"], upsell_reason: "Includes private balcony" }
  ],
  ai_response: "Great! I found some wonderful options for 2 adults in March."
}
```

---

## 5. Smart Cart

**Component:** `src/components/booking/SmartCart.tsx`

- **Appears** when first item added to cart
- **Persists** across page refreshes (via ItineraryContext + localStorage)
- **Expands** to show full item list with remove buttons
- Clicking "Checkout →" expands the Inline Checkout accordion

```
┌──────────────────────────────────────────────────────────────────┐
│  🛒 Deluxe Suite · Mar 7-10 · 2 guests    R 4,500  [Checkout →] │
└──────────────────────────────────────────────────────────────────┘
```

---

## 6. Inline Checkout

**Component:** `src/components/booking/InlineCheckout.tsx`

Accordion sections:
1. **Order Summary** — room details, dates, price breakdown
2. **Guest Details** — Name (required, min 2 chars), Email (required, valid format), Phone (optional)
3. **Special Requests** — free-text, max 1000 chars
4. **Pay Now button** — initiates PayFast flow

Guest details persist to `localStorage` key `rol_guest_details`.

---

## 7. Payment Processing (PayFast)

**Component:** `src/components/booking/PayFastOnsiteModal.tsx`  
**Edge Function:** `supabase/functions/payfast-api/index.ts`

### Payment-First Architecture

```
RULE: Payment MUST succeed before PMS booking push.
If payment succeeds but PMS fails → booking is still valid (sync_warning).
```

### Flow

```
Frontend                          Edge Function                    PayFast
────────                          ─────────────                    ───────
    │                                  │                              │
    │ 1. User clicks "Pay Now"         │                              │
    │──────────────────────────────────>│                              │
    │     POST /payfast-api            │                              │
    │     { action: "initiate_onsite_payment", booking_id }           │
    │                                  │                              │
    │                                  │ 2. Generate payment UUID     │
    │                                  │─────────────────────────────>│
    │                                  │<─────────────────────────────│
    │<─────────────────────────────────│     { uuid: "xxx" }          │
    │                                  │                              │
    │ 3. Open PayFast modal            │                              │
    │    window.payfast_do_onsite_payment({ uuid })                   │
    │                                  │                              │
    │ 4. User completes payment        │                              │
    │                                  │                              │
    │ 5. PayFast modal: success callback                              │
    │    → Frontend navigates to confirmation page                    │
    │                                  │                              │
    │                                  │ 6. ITN callback (server→server)
    │                                  │<─────────────────────────────│
    │                                  │     { payment_status: "COMPLETE" }
    │                                  │                              │
    │                                  │ 7. Update booking:           │
    │                                  │    payment_status = 'paid'   │
    │                                  │    paid_at = now()           │
    │                                  │                              │
    │                                  │ 8. Trigger push-booking      │
    │                                  │ 9. Trigger send-booking-email│
```

### PayFast Modal Visibility

The `PayFastOnsiteModal` uses a `payFastActive` state to hide the underlying booking modal while the PayFast engine is open, preventing window overlap.

---

## 8. Post-Payment Backend Pipeline

Triggered by the PayFast ITN callback. All steps are asynchronous — the guest sees the confirmation page immediately.

### Step 1: Update Booking Record
```sql
UPDATE bookings SET payment_status = 'paid', paid_at = now(), payment_reference = '...'
WHERE id = booking_id;
```

### Step 2: PMS Sync (`push-booking`)
```
1. Look up property.external_system
2. Verify live availability with PMS (NO BOOKING FROM CACHE)
3. Create reservation via PMS adapter
4. Store external_reservation_id on booking
5. Update status = 'confirmed'
6. For manual properties (external_system = 'none'): block dates in property_availability
```

If PMS sync fails:
- Booking remains valid (payment already received)
- `sync_warning` attached to email
- Admin alert email sent to `admin@roomsonline.co.za`

### Step 3: Guest Confirmation Email (`send-booking-email`, status: `success`)

### Step 4: Property Owner Notification (`send-booking-email`, status: `property_notification`)
- Only sent for non-PMS properties (`external_system = 'none'`)
- Sent to `property.owner_email`

### Step 5: Admin Alert (if sync failed) (`send-booking-email`, status: `admin_alert`)
- Sent to `admin@roomsonline.co.za`
- Includes sync error details and "View Booking in Dashboard" CTA

---

## 9. Email Notifications

All emails delivered via **Resend** using `notify.roomsonline.co.za` domain.

### 9.1 Guest Confirmation Email

**Edge Function:** `send-booking-email` (status: `success`)  
**Recipient:** `booking.guest_email`  
**Subject:** `Booking Confirmed #REF - Property Name`  
**From:** `Property Name <noreply@notify.roomsonline.co.za>` (branded) or `RoomsOnline <hello@notify.roomsonline.co.za>` (default)

**Content:**
- ✓ Booking Confirmed header
- Booking reference (external_reservation_id or first 8 chars of booking UUID)
- Property name + location
- Stay details: check-in/out dates, nights, guest count
- Multi-room itinerary (if applicable, with per-room dates and guest breakdown)
- Guest information (name, email, phone)
- Total amount
- Payment confirmation block (if paid: transaction ref, method, date)
- Payment pending notice (if not paid: "invoice in due course")
- Special requests (if any)
- Sync warning (if PMS sync failed)

**Attachments:** Journey brochure HTML file (if booking has an associated itinerary)

**Branding:**
- ROL'OS properties (`is_rol_property` + brand colours): auto-branded header/footer with property logo, accent colour
- Other properties: branded only if `brand_override_enabled = true`
- Default: RoomsOnline Sleep in Africa branding

**Custom Templates:**
- Properties can have custom email templates stored in `properties.amenities.templates.template_content`
- Template variables replaced: `{{guest_name}}`, `{{check_in_date}}`, `{{total_amount}}`, `{{property_name}}`, etc.
- When booking is paid, hardcoded "not yet paid" text is stripped and payment confirmation block injected

### 9.2 Itinerary Confirmation Email (Multi-Property Journeys)

**Edge Function:** `send-itinerary-email`  
**Recipient:** `itinerary.guest_email`  
**Subject:** `Your Journey is Confirmed! | Property A → Property B`

**Content:**
- "Your Journey Awaits" header with total nights and destination count
- Journey reference
- Guest details
- Per-stay cards (property name, location, room type, dates, guests, price)
- Total amount
- Payment note
- Special requests
- "Download Your Journey Brochure" CTA
- Brochure HTML attachment

**Pre-send enrichment:** If a property has < 3 local experiences, `enrich-property-experiences` is called to populate AI-generated dining/activity suggestions before brochure generation.

### 9.3 Property Owner Notification

**Edge Function:** `send-booking-email` (status: `property_notification`)  
**Recipient:** `property.owner_email` or `recipient_email` from request  
**Subject:** `🎉 New Booking Received - Guest Name - Date to Date`

**Content:**
- 🎉 NEW BOOKING RECEIVED header
- Booking reference
- Stay details (dates, nights, guests, room breakdown)
- Guest information (name, email as mailto link, phone as tel link)
- Payment confirmation or total amount
- Special requests (highlighted in amber)
- "📋 Action Required" box (for non-PMS properties: manually record in PMS)

### 9.4 Admin Alert (Sync Failure on Paid Booking)

**Edge Function:** `send-booking-email` (status: `admin_alert`)  
**Recipient:** `admin@roomsonline.co.za`  
**Subject:** `⚠️ ACTION REQUIRED: Paid booking sync failed - Property - Guest`

**Content:**
- ⚠️ MANUAL ACTION REQUIRED header
- Booking reference
- Sync error details (monospace)
- Booking details (property, PMS system, dates, guests)
- Guest information
- ✓ Payment Confirmed block (amount, ref, method)
- 📋 Required Action box
- "View Booking in Dashboard" CTA button

### 9.5 Failure Email (Booking Issue)

**Edge Function:** `send-booking-email` (status: `failed`)  
**Recipient:** `booking.guest_email`  
**Subject:** `Booking Issue #REF - Property Name`

**Content:**
- ⚠ Booking Issue header
- Error description
- Attempted booking summary
- Contact support CTA

### Email Branding Resolution Logic

```typescript
function resolveBranding(property) {
  const isRol = !!property.is_rol_property;
  const hasColors = !!property.brand_primary_color;
  // ROL'OS properties auto-brand when colours exist (no toggle needed)
  // Other properties require brand_override_enabled = true
  const isBranded = isRol ? hasColors : (brand_override_enabled && hasColors);
  return { isBranded, accentColor, logoUrl, senderName, fontColor };
}
```

---

## 10. Confirmation Page

### Single-Property Booking

**Route:** `/booking-confirmation/:bookingId`  
**Component:** `src/pages/BookingConfirmation.tsx`

Displays: reference, check-in/out dates, guest count, per-room itinerary (if multi-room), payment status, payment reference.

### Multi-Property Journey

**Route:** `/journey/confirmation/:id`  
**Component:** `src/pages/JourneyConfirmation.tsx`

Displays: journey reference, all stays, total price, PDF brochure download, "Email sent" confirmation.

### Google Ads Conversion

Fires `window.gtag_report_conversion()` on confirmation page load.

---

## 11. PDF Brochure Generation

**Edge Function:** `generate-itinerary-pdf`

Structure:
1. **Cover** — hero image, guest name, dates, property name
2. **Personalized Poem** — AI-generated (Gemini 2.5 Flash via Lovable AI)
3. **Itinerary Timeline** — check-in/out per property with room details
4. **Weather & Local Tips** — Open-Meteo forecast, AI-curated local gems (15km dining, 30km experiences)
5. **Surprise Voucher** — discount code with QR, stored in `experience_vouchers` table
6. **Thank You** — contact details

**Stack:** HTML template with inline CSS, Puppeteer rendering, stored in Supabase Storage `itinerary-pdfs` bucket.

---

## 12. State Management

### Context Hierarchy

```
App
├── ItineraryProvider          ← Multi-property journey state
│   └── MobileBookingProvider  ← Selected dates/guests for current property
│       └── CurrencyProvider   ← Currency formatting
│           └── PropertyShowcase
│               ├── AIConciergePanel
│               ├── SmartCart
│               └── InlineCheckout
```

### MobileBookingContext

**File:** `src/contexts/MobileBookingContext.tsx`  
**Storage:** `sessionStorage` key `mobile_booking_state`

```typescript
interface BookingState {
  propertyId: string | null;
  propertyName: string | null;
  propertySlug: string | null;
  checkIn: string | null;   // "YYYY-MM-DD"
  checkOut: string | null;
  rooms: BookingRoom[];
  rateTypeId: string | null;
  rateTypeName: string | null;
  guestDetails: GuestDetails;
  totalCost: number;
  isExpanded: boolean;
}
```

### ItineraryContext

**File:** `src/contexts/ItineraryContext.tsx`  
**Storage:** `sessionStorage` + `localStorage`

```typescript
interface ItineraryContextType {
  stays: Stay[];
  totalPrice: number;
  totalNights: number;
  currency: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  specialRequests: string;
  addStay: (stay: Stay) => void;
  removeStay: (stayId: string) => void;
  updateGuest: (field: string, value: string) => void;
  clearItinerary: () => void;
  hasStays: boolean;
  isMultiProperty: boolean;
}

interface Stay {
  id: string;
  property_id: string;
  property_name: string;
  property_image: string;
  external_system: string;  // 'benson' | 'hostfully' | 'nightsbridge' | 'none'
  dates: { check_in: string; check_out: string };
  rooms: Array<{
    room_type_id: string;
    room_type_name: string;
    quantity: number;
    rate_per_night: number;
    total_price: number;
  }>;
  guests: { adults: number; children: number; infants: number };
  price_breakdown: { subtotal: number; fees: number; total: number };
  nights: number;
}
```

### localStorage Keys

| Key | Purpose |
|-----|---------|
| `rol_itinerary` | Full journey state (stays array) |
| `rol_guest_details` | Guest form data (name, email, phone) |
| `rol_currency` | Selected currency (e.g. "ZAR") |

---

## 13. PMS Integration

### Supported Systems

| PMS | Capabilities | Adapter |
|-----|-------------|---------|
| Benson | Availability, Rates, Bookings | `benson-api` |
| Hostfully | Availability, Rates, Bookings, Rooms | `hostfully-api` |
| HotelBeds | Availability, Rates, Bookings | `hotelbeds-api` |
| NightsBridge | External redirect to NB widget | `nightsbridge-*` |
| Checkfront | Availability, Bookings | `checkfront-api` |
| None (Manual) | ROL manages availability | `push-booking` direct |

### Adapter Isolation

Each PMS has its own edge function under `supabase/functions/`:
```
benson-api/       hostfully-api/     hotelbeds-api/
checkfront-api/   nightsbridge-/     push-booking/  (universal orchestrator)
```

### Booking Push Flow

```typescript
switch (property.external_system) {
  case 'benson':    // → benson-api
  case 'hostfully': // → hostfully-api
  case 'hotelbeds': // → hotelbeds-api
  case 'none':      // → block dates in property_availability
    await supabase.from('property_availability').upsert(
      dateRange.map(date => ({
        property_id, date, room_type, available_units: 0, is_stop_sell: true
      })),
      { onConflict: 'property_id,date,room_type' }
    );
}
```

### Price Sources

| PMS | Source |
|-----|--------|
| Hostfully | Live API call to `hostfully-api` |
| Benson / HotelBeds | `pms_availability_cache` table |
| Manual (`none`) | `property_availability` table |

---

## 14. Database Schema

### bookings

```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY,
  property_id UUID REFERENCES properties(id),
  room_type_id UUID,
  rooms JSONB,                          -- Array of room selections
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  teens INTEGER DEFAULT 0,
  infants INTEGER DEFAULT 0,
  pets INTEGER DEFAULT 0,
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT,
  guest_name_encrypted TEXT,            -- PII encryption
  guest_email_encrypted TEXT,
  guest_phone_encrypted TEXT,
  total_price DECIMAL(10,2) NOT NULL,
  charges_breakdown JSONB,
  payment_status TEXT DEFAULT 'pending', -- pending | paid
  payment_method TEXT,                   -- 'payfast'
  payment_reference TEXT,                -- PayFast transaction ref
  payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending',         -- pending | confirmed | cancelled
  external_reservation_id TEXT,          -- PMS booking reference
  booking_channel TEXT DEFAULT 'direct', -- direct | rol_itinerary
  ai_metadata JSONB,                     -- { suggestion_source, model_used, session_id }
  special_requests TEXT,
  special_requests_parsed JSONB,
  voucher TEXT,
  source_url TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### itineraries

```sql
CREATE TABLE itineraries (
  id UUID PRIMARY KEY,
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  stays JSONB NOT NULL,
  total_price DECIMAL(10,2),
  total_nights INTEGER,
  currency TEXT DEFAULT 'ZAR',
  status TEXT DEFAULT 'draft',           -- draft | confirmed | completed | cancelled
  special_requests TEXT,
  brochure_pdf_url TEXT,
  brochure_generated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

### itinerary_bookings

Links itineraries to individual booking records.

### booking_sync_status

Tracks PMS sync state per booking (sync_status, error_message, attempts).

### experience_vouchers

Stores surprise voucher codes generated for itineraries.

---

## 15. Edge Functions

### Core Booking Pipeline

| Function | Trigger | Purpose |
|----------|---------|---------|
| `ai-booking-concierge` | Chat input | Parse NL, call PMS adapters, return suggestions |
| `payfast-api` | Pay button / ITN | Initiate payment, handle ITN callback |
| `push-booking` | Post-payment ITN | Verify availability, create PMS reservation |
| `multi-push-booking` | Multi-property | Sequential booking with rollback |
| `validate-itinerary-availability` | Pre-payment | Verify all stays still available |
| `send-booking-email` | Post-booking | Guest confirmation, property notification, admin alerts |
| `send-itinerary-email` | Post-booking | Multi-stay journey confirmation email |
| `generate-itinerary-pdf` | Post-booking | Create personalized HTML brochure |
| `enrich-property-experiences` | Pre-brochure | AI-generate local experiences if < 3 exist |

### PMS Adapters

| Function | PMS |
|----------|-----|
| `benson-api` | Benson |
| `hostfully-api` | Hostfully |
| `hotelbeds-api` | HotelBeds |
| `nightsbridge-reservations-sync` | NightsBridge (pull only) |

---

## 16. Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `AI_CONCIERGE_ENABLED` | `true` | Master switch — if false, show error state (not fallback UI) |
| `VOICE_INPUT_ENABLED` | `true` | Enable/disable voice input button |
| `ENHANCED_PDF_ENABLED` | `true` | Enable AI poem + personalized content in PDF |
| `PROACTIVE_SUGGESTIONS_ENABLED` | `true` | Enable AI proactive upgrade suggestions |

---

## 17. Error Handling

| Category | Example | Handling |
|----------|---------|----------|
| **AI Failure** | Concierge API timeout | Error in chat, retry button, contact info |
| **Availability Changed** | Room booked during checkout | `DateReselectDialog` with alternatives |
| **Payment Failed** | Card declined | PayFast shows error, user retries |
| **PMS Sync Failed** | API error after payment | Booking valid, guest email has sync warning, admin alert sent |
| **Network Error** | User offline | Toast notification, retry button |

**Error Boundary:** `ConciergeErrorBoundary` wraps AI panel. Fallback shows contact info + retry button.

---

## 18. File Reference

### Active Components

```
src/components/booking/
├── AIConciergePanel.tsx         # Chat interface, voice input, suggestions
├── VoiceInputButton.tsx         # Web Speech API
├── SmartCart.tsx                 # Sticky cart bar
├── InlineCheckout.tsx           # Checkout accordion
├── PayFastOnsiteModal.tsx       # Payment modal
├── ConciergeErrorBoundary.tsx   # Error boundary
├── ConciergeSkeleton.tsx        # Loading state
├── LuxuryRoomCard.tsx           # Room suggestion cards
├── PersonalizedSuggestion.tsx   # AI suggestion component
└── ValueHintBadge.tsx           # "Best Value" badges
```

### Pages

```
src/pages/
├── PropertyShowcase.tsx         # Main property + booking page
├── JourneyCheckout.tsx          # Multi-property checkout
├── JourneyConfirmation.tsx      # Multi-property confirmation
└── BookingConfirmation.tsx      # Single booking confirmation
```

### State Management

```
src/contexts/
├── ItineraryContext.tsx          # Journey state
├── MobileBookingContext.tsx      # Date/guest selection
└── CurrencyContext.tsx           # Currency formatting
```

### Edge Functions

```
supabase/functions/
├── ai-booking-concierge/        # NL parsing
├── payfast-api/                 # Payment processing + ITN
├── push-booking/                # PMS sync
├── multi-push-booking/          # Multi-property orchestration
├── validate-itinerary-availability/
├── send-booking-email/          # Guest, property, admin emails
├── send-itinerary-email/        # Journey confirmation email
├── generate-itinerary-pdf/      # PDF brochure
├── enrich-property-experiences/ # AI experience enrichment
├── benson-api/
├── hostfully-api/
├── hotelbeds-api/
└── nightsbridge-reservations-sync/
```

### Deprecated (Do Not Use)

```
src/components/booking/
├── QuickBookDrawer.tsx            # DEPRECATED — emergency fallback only
└── FloatingDateGuestPicker.tsx    # DEPRECATED — emergency fallback only
```

---

## 19. Troubleshooting

### Dates Not Syncing
**Symptom:** Wrong dates shown in checkout  
**Check:** MobileBookingContext provider wrapping, `setDates()` calls, sessionStorage key `mobile_booking_state`

### Price Shows as 0
**Check:** Hostfully → is `hostfully-api` returning rates? Cache-based → is `pms_availability_cache` populated? Manual → is `property_availability` set up?

### Booking Fails After Payment
**Check:** `push-booking` edge function logs, `booking_sync_status` table, PMS credentials in `api_keys`

### Calendar Not Blocking After Booking
**Check:** Is property `external_system = 'none'`? Check `property_availability` for `is_stop_sell = true` records.

### Email Not Received
**Check:** `sync_logs` table for `sync_type = 'email_send'`, Resend dashboard, `RESEND_API_KEY` secret configured.

### Itinerary Deduplication
`multi-push-booking` reuses existing placeholder bookings matching `itinerary_id` for the first stay to prevent revenue double-counting.

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial documentation |
| 2.0 | Jan 2026 | Single flow mandate, AI Concierge, Smart Cart, Inline Checkout |
| 3.0 | Mar 2026 | Consolidated from `booking-flow-complete.md` + `booking-flow-developer-guide.md`. Added complete email notification reference (guest, property owner, admin alert, failure). Added branding resolution logic, custom template handling, brochure attachment flow. |
