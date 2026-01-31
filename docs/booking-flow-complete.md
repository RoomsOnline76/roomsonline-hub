# RoomsOnline Booking Flow — Complete Developer Reference

> **Version:** 2.0  
> **Last Updated:** January 2026  
> **Audience:** Developers, Technical Architects  
> **Authority:** This is the single source of truth for the RoomsOnline booking system.

---

## Executive Summary

RoomsOnline operates a **single booking flow**. There are no alternatives, no branching paths, no legacy modes available to users. The AI Concierge experience is the booking experience.

If the AI system is unavailable, the application displays an error state—it does not fall back to a different UI. Legacy components exist in the codebase solely for historical reference and emergency recovery; they are not user-accessible.

---

## Table of Contents

1. [Architecture Principles](#1-architecture-principles)
2. [The Booking Flow](#2-the-booking-flow)
3. [Component Reference](#3-component-reference)
4. [AI Concierge Panel](#4-ai-concierge-panel)
5. [Smart Cart](#5-smart-cart)
6. [Inline Checkout](#6-inline-checkout)
7. [Payment Processing](#7-payment-processing)
8. [PMS Synchronization](#8-pms-synchronization)
9. [Confirmation & PDF Generation](#9-confirmation--pdf-generation)
10. [State Management](#10-state-management)
11. [Database Schema](#11-database-schema)
12. [Edge Functions](#12-edge-functions)
13. [Feature Flags](#13-feature-flags)
14. [Error Handling](#14-error-handling)
15. [File Locations](#15-file-locations)

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

### Core Tenets

| Principle | Implementation |
|-----------|----------------|
| **AI-First** | Natural language and voice input are the primary interaction mode |
| **Single Page** | Entire booking happens on `/property/:slug` — no page navigation until confirmation |
| **Payment-First** | PayFast must succeed before any PMS sync occurs |
| **PMS-Agnostic** | Benson, Hostfully, HotelBeds, NightsBridge — all use the same UI |
| **Graceful Degradation** | If AI fails, show error — don't show different UI |

### What "Graceful Degradation" Means

When the AI Concierge cannot respond:

1. Display an error message in the chat panel
2. Offer a "Retry" button
3. If persistent failure, show contact information for manual booking
4. **Never** reveal legacy components to the user

---

## 2. The Booking Flow

### Visual Flowchart

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
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │  AI CONCIERGE PANEL (bottom-right, persistent)                  │    │
    │  │                                                                  │    │
    │  │  [Collapsed State]                                              │    │
    │  │  ✨ "AI Travel Concierge" orb — click to expand                 │    │
    │  │                                                                  │    │
    │  │  [Expanded State]                                               │    │
    │  │  • Chat interface with message history                          │    │
    │  │  • Voice input button (mic icon)                                │    │
    │  │  • Suggestion cards (rooms, dates, upsells)                     │    │
    │  │  • "Add to Cart" actions on each suggestion                     │    │
    │  └─────────────────────────────────────────────────────────────────┘    │
    │                                                                          │
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │  SMART CART (bottom, sticky bar — appears when items added)     │    │
    │  │                                                                  │    │
    │  │  [Room Name] • [Dates] • [Guests] • [Price]     [Checkout →]    │    │
    │  │                                                                  │    │
    │  │  Click expands INLINE CHECKOUT accordion                        │    │
    │  └─────────────────────────────────────────────────────────────────┘    │
    │                                                                          │
    │  ┌─────────────────────────────────────────────────────────────────┐    │
    │  │  INLINE CHECKOUT (accordion, expands above Smart Cart)          │    │
    │  │                                                                  │    │
    │  │  ┌─ Order Summary (collapsible) ────────────────────────────┐   │    │
    │  │  │  Room details, dates, price breakdown                     │   │    │
    │  │  └───────────────────────────────────────────────────────────┘   │    │
    │  │                                                                  │    │
    │  │  ┌─ Guest Details ───────────────────────────────────────────┐   │    │
    │  │  │  Name, Email, Phone                                        │   │    │
    │  │  └───────────────────────────────────────────────────────────┘   │    │
    │  │                                                                  │    │
    │  │  ┌─ Special Requests ────────────────────────────────────────┐   │    │
    │  │  │  Free-text input for dietary, accessibility, etc.         │   │    │
    │  │  └───────────────────────────────────────────────────────────┘   │    │
    │  │                                                                  │    │
    │  │                              [Pay Now R X,XXX]                   │    │
    │  └─────────────────────────────────────────────────────────────────┘    │
    │                                                                          │
    └─────────────────────────────────────────────────────────────────────────┘
         │
         │ Click "Pay Now"
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    PAYFAST MODAL (overlay)                               │
    │                                                                          │
    │    PayFast's hosted payment form appears                                │
    │    User enters card details                                             │
    │    PayFast processes payment                                            │
    │                                                                          │
    │    [Success] ──────────────────────────────────────────────┐            │
    │    [Cancel]  ──────────────────────────────────────────────┼── Back     │
    │    [Failure] ──────────────────────────────────────────────┘            │
    └─────────────────────────────────────────────────────────────────────────┘
         │
         │ Payment Success (ITN callback triggers backend)
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    BACKEND PROCESSING                                    │
    │                    (invisible to user)                                   │
    │                                                                          │
    │    1. PayFast ITN received by payfast-api edge function                 │
    │    2. Booking record updated: payment_status = 'paid'                   │
    │    3. push-booking called: verify availability → create PMS reservation │
    │    4. generate-itinerary-pdf called: create personalized PDF            │
    │    5. send-booking-email called: send confirmation with PDF attached    │
    │                                                                          │
    └─────────────────────────────────────────────────────────────────────────┘
         │
         │ Frontend navigates immediately after PayFast success callback
         ▼
    ┌─────────────────────────────────────────────────────────────────────────┐
    │                    CONFIRMATION PAGE                                     │
    │                    /journey/confirmation/:id                             │
    │                                                                          │
    │    ✓ "Your booking is confirmed!"                                       │
    │    • AI-generated summary of the stay                                   │
    │    • Download PDF brochure button                                       │
    │    • "Email sent to [email]" confirmation                               │
    │    • Property contact details                                           │
    │    • Return to browse button                                            │
    │                                                                          │
    └─────────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step Narrative

1. **User arrives at Property Showcase** (`/property/:slug`)
   - Page displays property hero, description, rooms, amenities
   - AI Concierge Panel appears as collapsed orb in bottom-right

2. **User interacts with AI Concierge**
   - Clicks orb or types/speaks a query
   - Examples: "2 adults, 4 nights in March", "romantic getaway next weekend"
   - AI parses request, calls PMS for live availability, returns suggestions

3. **User selects from suggestions**
   - Suggestion cards show room options, dates, pricing
   - "Add to Cart" button on each card
   - AI may proactively suggest upgrades or alternatives

4. **Smart Cart appears**
   - Sticky bar at bottom shows selected room(s)
   - Displays total price, guest count, dates
   - "Checkout" button expands inline checkout

5. **User completes Inline Checkout**
   - Accordion expands with order summary, guest form, special requests
   - All fields validated in real-time
   - "Pay Now" button initiates payment

6. **PayFast Modal handles payment**
   - Modal overlays page (no navigation)
   - User completes payment in PayFast's secure form
   - Success callback triggers navigation

7. **Confirmation page displayed**
   - Immediate navigation to `/journey/confirmation/:id`
   - Backend processes PMS sync and email in background
   - User sees confirmation while email is being sent

---

## 3. Component Reference

### Active Components (Production)

| Component | File | Purpose |
|-----------|------|---------|
| **AIConciergePanel** | `src/components/booking/AIConciergePanel.tsx` | Chat interface, voice input, suggestion display |
| **VoiceInputButton** | `src/components/booking/VoiceInputButton.tsx` | Web Speech API integration |
| **SmartCart** | `src/components/booking/SmartCart.tsx` | Sticky bottom bar with cart summary |
| **InlineCheckout** | `src/components/booking/InlineCheckout.tsx` | Accordion checkout form |
| **PayFastOnsiteModal** | `src/components/booking/PayFastOnsiteModal.tsx` | Payment modal wrapper |
| **ConciergeErrorBoundary** | `src/components/booking/ConciergeErrorBoundary.tsx` | Error handling for AI panel |

### Deprecated Components (Do Not Use)

These exist in the codebase for emergency recovery only. They are not rendered in production.

| Component | File | Status |
|-----------|------|--------|
| ~~QuickBookDrawer~~ | `src/components/booking/QuickBookDrawer.tsx` | **DEPRECATED** — Not rendered |
| ~~FloatingDateGuestPicker~~ | `src/components/booking/FloatingDateGuestPicker.tsx` | **DEPRECATED** — Not rendered |

**Why they exist:** If a critical AI service outage requires emergency intervention, developers can temporarily enable these via feature flag. This is an ops decision, not a user-facing option.

---

## 4. AI Concierge Panel

### Visual States

```
┌─────────────────────────────────────────┐
│  COLLAPSED STATE                        │
│                                         │
│                              ┌───────┐  │
│                              │  ✨   │  │
│                              │ orb   │  │
│                              └───────┘  │
│                                         │
│  Subtle floating button, bottom-right   │
│  Label: "AI Travel Concierge"           │
│  Pulses gently to attract attention     │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  EXPANDED STATE                         │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │ ✨ AI Travel Concierge        [×] │  │
│  ├───────────────────────────────────┤  │
│  │                                   │  │
│  │  [AI Message]                     │  │
│  │  "Welcome! How can I help you     │  │
│  │   plan your perfect stay?"        │  │
│  │                                   │  │
│  │  [User Message]                   │  │
│  │  "2 adults for a long weekend"    │  │
│  │                                   │  │
│  │  [AI Message]                     │  │
│  │  "Great choice! Here are some     │  │
│  │   options for you..."             │  │
│  │                                   │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │ SUGGESTION CARD             │  │  │
│  │  │ Deluxe Suite                │  │  │
│  │  │ Mar 7-10 • 2 adults         │  │  │
│  │  │ R 4,500 total               │  │  │
│  │  │ [Add to Cart]               │  │  │
│  │  └─────────────────────────────┘  │  │
│  │                                   │  │
│  ├───────────────────────────────────┤  │
│  │ [🎤] [Type your message...]  [→] │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Features

#### Natural Language Understanding

The AI parses conversational requests and extracts booking parameters:

| User Says | AI Extracts |
|-----------|-------------|
| "2 adults, 4 nights starting March 15" | adults: 2, nights: 4, check_in: 2026-03-15 |
| "romantic weekend for 2" | adults: 2, nights: 2, vibe: romantic, dates: next weekend |
| "family trip with 2 kids in April" | adults: 2, children: 2, month: April |
| "cheapest option for next week" | dates: next 7 days, sort: price_asc |

#### Voice Input

- **Activation:** Click microphone icon or say wake word
- **Technology:** Web Speech API (browser-native)
- **Visual Feedback:** Pulsing mic icon during recording
- **Transcription:** Real-time text appears in input field
- **Fallback:** Text input always available if voice fails

```typescript
// VoiceInputButton.tsx usage
const { isListening, transcript, startListening, stopListening } = useSpeechRecognition();
```

#### Proactive Suggestions

The AI doesn't just respond—it anticipates:

| Trigger | Suggestion |
|---------|------------|
| User inactive for 8 seconds after viewing rooms | "I notice you're looking at the Deluxe Suite. Would you like me to check availability?" |
| User adds basic room | "I've found a complimentary upgrade to an ocean-view room—interested?" |
| User selects dates near event | "Heads up: there's a jazz festival that weekend. Book early for best rates!" |
| User hesitates on price | "This rate includes breakfast—that's R 300/day in value!" |

#### Suggestion Cards

Each suggestion card contains:

```typescript
interface SuggestionCard {
  room_type_id: string;
  room_name: string;
  check_in: string;      // ISO date
  check_out: string;     // ISO date
  nights: number;
  adults: number;
  children: number;
  price_per_night: number;
  total_price: number;
  currency: string;
  value_badges: string[];  // e.g., ["Best Value", "Last Room"]
  upsell_note?: string;    // e.g., "Includes free airport transfer"
}
```

---

## 5. Smart Cart

### Behavior

The Smart Cart is a sticky bar at the bottom of the viewport. It:

- **Appears** when first item is added to cart
- **Updates** in real-time as items change
- **Expands** to show full checkout when clicked
- **Persists** across page refreshes (via ItineraryContext + localStorage)

### Visual Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🛒 Deluxe Suite · Mar 7-10 · 2 guests      R 4,500    [Checkout →]        │
└─────────────────────────────────────────────────────────────────────────────┘
```

For multiple items:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🛒 2 rooms · 6 nights · 4 guests           R 12,800   [Checkout →]        │
│     ▲ Tap to expand                                                         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Expanded View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  YOUR JOURNEY                                                       [−]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🏨 Deluxe Suite at The Grand Hotel                                  │   │
│  │    Mar 7-10, 2026 · 3 nights · 2 adults                             │   │
│  │    R 4,500                                              [Remove]    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🏨 Ocean View Room at Seaside Lodge                                 │   │
│  │    Mar 10-13, 2026 · 3 nights · 2 adults                            │   │
│  │    R 8,300                                              [Remove]    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Total: 6 nights                                           R 12,800        │
│                                                                             │
│                                              [Checkout →]                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. Inline Checkout

### Accordion Structure

When "Checkout" is clicked, the checkout accordion expands above the Smart Cart:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CHECKOUT                                                           [×]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ▼ ORDER SUMMARY                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Deluxe Suite · Mar 7-10 · 3 nights · 2 adults         R 4,500       │   │
│  │ Ocean View Room · Mar 10-13 · 3 nights · 2 adults     R 8,300       │   │
│  │ ───────────────────────────────────────────────────────────────     │   │
│  │ Subtotal                                              R 12,800      │   │
│  │ Service Fee                                           R 0           │   │
│  │ ───────────────────────────────────────────────────────────────     │   │
│  │ TOTAL                                                 R 12,800      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ▼ GUEST DETAILS                                                            │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Full Name *          [_______________________________]              │   │
│  │ Email *              [_______________________________]              │   │
│  │ Phone                [_______________________________]              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ▼ SPECIAL REQUESTS (optional)                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ [                                                                   ]│   │
│  │ [                                                                   ]│   │
│  │ [___________________________________________________________________]│   │
│  │ e.g., dietary requirements, early check-in, accessibility needs     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      [Pay Now R 12,800]                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  🔒 Secured by PayFast · Your payment details are encrypted                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Validation Rules

| Field | Validation |
|-------|------------|
| Full Name | Required, min 2 characters |
| Email | Required, valid email format |
| Phone | Optional, E.164 format preferred |
| Special Requests | Optional, max 1000 characters |

### Guest Details Persistence

Guest details are saved to localStorage on blur and restored on page load:

```typescript
// localStorage key: rol_guest_details
{
  guest_name: "John Smith",
  guest_email: "john@example.com",
  guest_phone: "+27821234567"
}
```

---

## 7. Payment Processing

### PayFast Onsite Integration

RoomsOnline uses PayFast's "Onsite" payment method, which embeds PayFast's secure payment form in a modal overlay.

### Payment Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PAYMENT PROCESSING                                  │
└─────────────────────────────────────────────────────────────────────────────┘

    Frontend                          Edge Function                    PayFast
    ────────                          ─────────────                    ───────
        │                                  │                              │
        │ 1. User clicks "Pay Now"         │                              │
        │──────────────────────────────────>                              │
        │     POST /payfast-api            │                              │
        │     { action: "initiate_onsite_payment", booking_id }           │
        │                                  │                              │
        │                                  │ 2. Generate payment UUID     │
        │                                  │─────────────────────────────>│
        │                                  │                              │
        │                                  │<─────────────────────────────│
        │                                  │     { uuid: "xxx-xxx" }      │
        │<─────────────────────────────────│                              │
        │     { success: true, uuid }      │                              │
        │                                  │                              │
        │ 3. Load PayFast modal            │                              │
        │    window.payfast_do_onsite_payment({ uuid })                   │
        │                                  │                              │
        │         ┌────────────────────────────────────────┐              │
        │         │      PAYFAST MODAL (overlay)           │              │
        │         │                                        │              │
        │         │  Card Number: [________________]       │              │
        │         │  Expiry: [__/__]  CVV: [___]          │              │
        │         │                                        │              │
        │         │              [Pay R 12,800]            │              │
        │         └────────────────────────────────────────┘              │
        │                                  │                              │
        │ 4. User completes payment        │                              │
        │──────────────────────────────────────────────────────────────────>
        │                                  │                              │
        │                                  │ 5. ITN callback (server-to-server)
        │                                  │<─────────────────────────────│
        │                                  │     POST /payfast-api        │
        │                                  │     { payment_status: "COMPLETE", ... }
        │                                  │                              │
        │                                  │ 6. Update booking            │
        │                                  │    payment_status = 'paid'   │
        │                                  │    paid_at = now()           │
        │                                  │                              │
        │                                  │ 7. Trigger PMS sync          │
        │                                  │    → push-booking            │
        │                                  │                              │
        │                                  │ 8. Generate PDF              │
        │                                  │    → generate-itinerary-pdf  │
        │                                  │                              │
        │                                  │ 9. Send confirmation email   │
        │                                  │    → send-booking-email      │
        │                                  │                              │
        │<──────────────────────────────────────────────────────────────────
        │ 10. PayFast callback(true)       │                              │
        │     Frontend navigates to        │                              │
        │     /journey/confirmation/:id    │                              │
        │                                  │                              │
```

### Critical Payment Rules

1. **Payment-First:** Booking is not pushed to PMS until payment succeeds
2. **ITN is Authoritative:** Frontend callback is for UX only; ITN is the source of truth
3. **Idempotency:** ITN handler checks if already processed before acting
4. **Sync Failures Don't Fail Booking:** If PMS sync fails after payment, booking is still valid

---

## 8. PMS Synchronization

### Supported PMS Adapters

| PMS | Edge Function | Booking Method |
|-----|---------------|----------------|
| Benson | `benson-api` | REST API |
| Hostfully | `hostfully-api` | REST API v3 |
| HotelBeds | `hotelbeds-api` | REST API |
| NightsBridge | External iframe | Redirect flow |
| Manual (None) | `push-booking` | Local availability table |

### push-booking Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         push-booking EDGE FUNCTION                          │
└─────────────────────────────────────────────────────────────────────────────┘

    Input: booking_id
        │
        ▼
    ┌─────────────────────────────────────┐
    │ 1. Load booking from database       │
    └─────────────────────────────────────┘
        │
        ▼
    ┌─────────────────────────────────────┐
    │ 2. Load property + PMS config       │
    │    (external_system, credentials)   │
    └─────────────────────────────────────┘
        │
        ▼
    ┌─────────────────────────────────────┐
    │ 3. Verify live availability         │◄──── RULE #1: Always verify
    │    Call PMS adapter for dates       │      before creating reservation
    └─────────────────────────────────────┘
        │
        ├── Not Available ──────────────────────────┐
        │                                           ▼
        │                           ┌─────────────────────────────────────┐
        │                           │ Return error:                       │
        │                           │ { error_code: "AVAILABILITY_CHANGED" }
        │                           │                                     │
        │                           │ Frontend shows DateReselectDialog   │
        │                           └─────────────────────────────────────┘
        │
        ├── Available
        ▼
    ┌─────────────────────────────────────┐
    │ 4. Create reservation in PMS        │
    │    - Transform to PMS format        │
    │    - POST to PMS API                │
    │    - Store external_reservation_id  │
    └─────────────────────────────────────┘
        │
        ├── PMS Error ──────────────────────────────┐
        │                                           ▼
        │                           ┌─────────────────────────────────────┐
        │                           │ Return sync_warning                 │
        │                           │ Booking still valid (payment done)  │
        │                           │ Email includes manual follow-up note│
        │                           └─────────────────────────────────────┘
        │
        ├── Success
        ▼
    ┌─────────────────────────────────────┐
    │ 5. Update booking record            │
    │    - status = 'confirmed'           │
    │    - external_reservation_id = X    │
    │                                     │
    │ 6. For manual properties:           │
    │    - Block dates in availability    │
    │    - is_stop_sell = true            │
    └─────────────────────────────────────┘
        │
        ▼
    Return { success: true, external_reservation_id }
```

---

## 9. Confirmation & PDF Generation

### Confirmation Page

Route: `/journey/confirmation/:id`

The confirmation page displays:

- Booking reference number
- Property name and dates
- AI-generated welcome message
- Download button for PDF brochure
- Confirmation that email was sent

### Enchanting PDF Brochure

The `generate-itinerary-pdf` edge function creates a personalized PDF document:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PDF STRUCTURE                                        │
└─────────────────────────────────────────────────────────────────────────────┘

    Page 1: COVER
    ┌─────────────────────────────────────┐
    │                                     │
    │         [Hero Image]                │
    │    Property at golden hour          │
    │                                     │
    │    "Welcome, John"                  │
    │    Your adventure awaits            │
    │                                     │
    │    March 7-13, 2026                 │
    │    The Grand Hotel                  │
    │                                     │
    └─────────────────────────────────────┘

    Page 2: PERSONALIZED POEM
    ┌─────────────────────────────────────┐
    │                                     │
    │    "A Journey Awaits"               │
    │                                     │
    │    Where mountains meet the sea,    │
    │    Your story starts anew,          │
    │    Adventure calls to thee,         │
    │    With skies of endless blue.      │
    │                                     │
    │    — Generated for John & Sarah     │
    │                                     │
    └─────────────────────────────────────┘

    Page 3: ITINERARY TIMELINE
    ┌─────────────────────────────────────┐
    │                                     │
    │    YOUR JOURNEY                     │
    │                                     │
    │    ○ Mar 7  Check-in 2pm            │
    │    │        The Grand Hotel         │
    │    │        Deluxe Suite            │
    │    │                                │
    │    ○ Mar 10 Check-out / Check-in    │
    │    │        Seaside Lodge           │
    │    │        Ocean View Room         │
    │    │                                │
    │    ○ Mar 13 Check-out 11am          │
    │                                     │
    └─────────────────────────────────────┘

    Page 4: WEATHER & LOCAL TIPS
    ┌─────────────────────────────────────┐
    │                                     │
    │    WEATHER FORECAST                 │
    │    ☀️ 24°C  ☀️ 26°C  🌤️ 23°C       │
    │    Mar 7    Mar 8    Mar 9          │
    │                                     │
    │    LOCAL GEMS                       │
    │    • Sunrise hike at Lion's Head    │
    │    • Harbour-side oysters at Nobu   │
    │    • Sunset cocktails at Bungalow   │
    │                                     │
    └─────────────────────────────────────┘

    Page 5: SURPRISE VOUCHER
    ┌─────────────────────────────────────┐
    │                                     │
    │    🎁 A GIFT FOR YOU                │
    │                                     │
    │    ┌───────────────────────────┐    │
    │    │      SUNSET-X7K2          │    │
    │    │                           │    │
    │    │   25% off Table Mountain  │    │
    │    │   Cable Car Experience    │    │
    │    │                           │    │
    │    │      [QR CODE]            │    │
    │    │                           │    │
    │    │   Valid until: Mar 31     │    │
    │    └───────────────────────────┘    │
    │                                     │
    └─────────────────────────────────────┘

    Page 6: THANK YOU
    ┌─────────────────────────────────────┐
    │                                     │
    │    Thank you for choosing           │
    │    RoomsOnline                      │
    │                                     │
    │    We can't wait to welcome you.    │
    │                                     │
    │    Questions? Contact us:           │
    │    hello@roomsonline.co.za          │
    │    +27 21 XXX XXXX                  │
    │                                     │
    └─────────────────────────────────────┘
```

### PDF Generation Stack

- **Template:** HTML with inline CSS
- **Rendering:** Puppeteer (headless Chrome)
- **AI Content:** Lovable AI (Gemini 2.5 Flash) for poem generation
- **Weather:** Open-Meteo API
- **Maps:** Google Static Maps API
- **Storage:** Supabase Storage bucket `itinerary-pdfs`

---

## 10. State Management

### Context Hierarchy

```
App
├── ItineraryProvider          ← Multi-property journey state
│   └── MobileBookingProvider  ← Selected dates/guests
│       └── CurrencyProvider   ← Currency formatting
│           └── PropertyShowcase
│               ├── AIConciergePanel
│               ├── SmartCart
│               └── InlineCheckout
```

### ItineraryContext

```typescript
interface ItineraryContextType {
  // Journey data
  stays: Stay[];
  totalPrice: number;
  totalNights: number;
  currency: string;
  
  // Guest info (persisted to localStorage)
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  specialRequests: string;
  
  // Actions
  addStay: (stay: Stay) => void;
  removeStay: (stayId: string) => void;
  updateGuest: (field: string, value: string) => void;
  clearItinerary: () => void;
  
  // Computed
  hasStays: boolean;
  isMultiProperty: boolean;
}

interface Stay {
  id: string;
  property_id: string;
  property_name: string;
  property_image: string;
  rooms: RoomSelection[];
  dates: { check_in: string; check_out: string };
  nights: number;
  guests: { adults: number; children: number; infants: number };
  price_breakdown: { subtotal: number; fees: number; total: number };
}
```

### localStorage Keys

| Key | Purpose | Format |
|-----|---------|--------|
| `rol_itinerary` | Full journey state | JSON (stays array) |
| `rol_guest_details` | Guest form data | JSON (name, email, phone) |
| `rol_currency` | Selected currency | String (e.g., "ZAR") |

---

## 11. Database Schema

### bookings Table

```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Property & Room
  property_id UUID REFERENCES properties(id),
  room_type_id UUID,
  rooms JSONB,  -- Array of room selections
  
  -- Dates & Guests
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  infants INTEGER DEFAULT 0,
  teens INTEGER DEFAULT 0,
  pets INTEGER DEFAULT 0,
  
  -- Guest Info (encrypted)
  guest_name TEXT NOT NULL,
  guest_email TEXT NOT NULL,
  guest_phone TEXT,
  guest_name_encrypted TEXT,
  guest_email_encrypted TEXT,
  guest_phone_encrypted TEXT,
  
  -- Pricing
  total_price DECIMAL(10,2) NOT NULL,
  charges_breakdown JSONB,
  
  -- Payment
  payment_status TEXT DEFAULT 'pending',
  payment_method TEXT,
  payment_reference TEXT,
  payment_intent_id TEXT,
  paid_at TIMESTAMPTZ,
  
  -- PMS Sync
  status TEXT DEFAULT 'pending',
  external_reservation_id TEXT,
  booking_channel TEXT DEFAULT 'direct',
  
  -- AI & Personalization
  ai_metadata JSONB,          -- { suggestion_source, model_used, session_id }
  surprise_elements JSONB,    -- { poem, voucher_code, map_url, image_urls[] }
  special_requests TEXT,
  special_requests_parsed JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### itineraries Table

```sql
CREATE TABLE itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Guest Info
  guest_name TEXT,
  guest_email TEXT,
  guest_phone TEXT,
  
  -- Journey Data
  stays JSONB NOT NULL,  -- Array of stays
  total_price DECIMAL(10,2),
  total_nights INTEGER,
  currency TEXT DEFAULT 'ZAR',
  
  -- Status
  status TEXT DEFAULT 'draft',  -- draft, confirmed, completed, cancelled
  
  -- PDF
  brochure_pdf_url TEXT,
  brochure_generated_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### experience_vouchers Table

```sql
CREATE TABLE experience_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID REFERENCES itineraries(id),
  
  code TEXT UNIQUE NOT NULL,        -- e.g., "SUNSET-X7K2"
  description TEXT,                  -- e.g., "25% off Table Mountain"
  discount_percent INTEGER,
  valid_until DATE,
  redeemed_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now()
);
```

---

## 12. Edge Functions

### Core Booking Functions

| Function | Trigger | Purpose |
|----------|---------|---------|
| `ai-booking-concierge` | Chat input | Parse natural language, call PMS adapters, return suggestions |
| `payfast-api` | Payment button / ITN | Initiate payment, handle callbacks |
| `push-booking` | Post-payment | Verify availability, create PMS reservation |
| `multi-push-booking` | Multi-property | Sequential booking with rollback |
| `generate-itinerary-pdf` | Post-booking | Create personalized PDF brochure |
| `send-booking-email` | Post-booking | Send confirmation with PDF attachment |

### PMS Adapter Functions

| Function | PMS | Operations |
|----------|-----|------------|
| `benson-api` | Benson | Availability, Rates, Create Booking |
| `hostfully-api` | Hostfully | Properties, Availability, Leads, Bookings |
| `hotelbeds-api` | HotelBeds | Search, Rates, Booking |
| `nightsbridge-reservations-sync` | NightsBridge | Sync reservations (pull only) |

### ai-booking-concierge Details

```typescript
// Request
{
  action: "parse_request",
  property_id: "uuid",
  message: "2 adults for 4 nights in March",
  session_id: "uuid",
  context: {
    previous_messages: [...],
    selected_dates: null,
    selected_room: null
  }
}

// Response
{
  success: true,
  parsed: {
    adults: 2,
    children: 0,
    nights: 4,
    month: "March",
    year: 2026,
    flexibility: "flexible"
  },
  suggestions: [
    {
      type: "room_option",
      room_type_id: "uuid",
      room_name: "Deluxe Suite",
      dates: { check_in: "2026-03-07", check_out: "2026-03-11" },
      price: 4500,
      badges: ["Best Value"],
      available: true
    },
    {
      type: "alternative",
      room_name: "Ocean View Suite",
      dates: { check_in: "2026-03-07", check_out: "2026-03-11" },
      price: 6200,
      badges: ["Upgrade"],
      upsell_reason: "Includes private balcony with ocean view"
    }
  ],
  proactive_suggestion: {
    type: "upgrade",
    message: "I noticed the Ocean View Suite is available at a special rate this week—interested?"
  },
  ai_response: "Great! I found some wonderful options for 2 adults in March. The Deluxe Suite offers the best value at R4,500 for 4 nights."
}
```

---

## 13. Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `AI_CONCIERGE_ENABLED` | `true` | Master switch for AI Concierge (if false, show error state) |
| `VOICE_INPUT_ENABLED` | `true` | Enable/disable voice input button |
| `ENHANCED_PDF_ENABLED` | `true` | Enable AI-generated poem and personalized content in PDF |
| `PROACTIVE_SUGGESTIONS_ENABLED` | `true` | Enable AI proactive upgrade/alternative suggestions |

### Flag Behavior

```typescript
// AI_CONCIERGE_ENABLED = false
// Result: Error state displayed, not legacy UI

<AIConciergePanel>
  {!aiEnabled ? (
    <div className="error-state">
      <p>Booking temporarily unavailable</p>
      <p>Please contact us directly: +27 21 XXX XXXX</p>
    </div>
  ) : (
    <ChatInterface />
  )}
</AIConciergePanel>
```

---

## 14. Error Handling

### Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| **AI Failure** | Concierge API timeout | Show error in chat, offer retry, show contact info |
| **Availability Changed** | Room booked while browsing | Show DateReselectDialog with alternative dates |
| **Payment Failed** | Card declined | PayFast shows error, user can retry |
| **PMS Sync Failed** | API error after payment | Booking valid, email includes manual follow-up note |
| **Network Error** | User offline | Toast notification, retry button |

### ConciergeErrorBoundary

Wraps the AI Concierge panel to catch React errors:

```typescript
<ConciergeErrorBoundary 
  fallback={<ConciergeFallbackUI />}
  onError={(error) => logError('concierge', error)}
>
  <AIConciergePanel property={property} />
</ConciergeErrorBoundary>
```

### Fallback UI (Error State)

```
┌─────────────────────────────────────────┐
│                                         │
│    😔 Something went wrong              │
│                                         │
│    Our AI concierge is temporarily      │
│    unavailable. Please try again or     │
│    contact us directly.                 │
│                                         │
│    📞 +27 21 XXX XXXX                   │
│    ✉️ bookings@roomsonline.co.za        │
│                                         │
│    [Try Again]                          │
│                                         │
└─────────────────────────────────────────┘
```

---

## 15. File Locations

### Active Components

```
src/components/booking/
├── AIConciergePanel.tsx      # Main chat interface
├── VoiceInputButton.tsx      # Web Speech API integration
├── SmartCart.tsx             # Sticky cart bar
├── InlineCheckout.tsx        # Checkout accordion
├── PayFastOnsiteModal.tsx    # Payment modal
├── ConciergeErrorBoundary.tsx # Error boundary
├── ConciergeSkeleton.tsx     # Loading state
├── LuxuryRoomCard.tsx        # Room suggestion cards
├── PersonalizedSuggestion.tsx # AI suggestion component
└── ValueHintBadge.tsx        # "Best Value" badges
```

### Edge Functions

```
supabase/functions/
├── ai-booking-concierge/     # Natural language parsing
├── payfast-api/              # Payment processing
├── push-booking/             # PMS sync
├── multi-push-booking/       # Multi-property orchestration
├── generate-itinerary-pdf/   # PDF generation
├── send-booking-email/       # Email delivery
├── benson-api/               # Benson PMS adapter
├── hostfully-api/            # Hostfully PMS adapter
└── hotelbeds-api/            # HotelBeds adapter
```

### Context Providers

```
src/contexts/
├── ItineraryContext.tsx      # Journey state management
├── MobileBookingContext.tsx  # Date/guest selection
└── CurrencyContext.tsx       # Currency formatting
```

### Deprecated (Do Not Use)

```
src/components/booking/
├── QuickBookDrawer.tsx       # DEPRECATED - Emergency fallback only
└── FloatingDateGuestPicker.tsx # DEPRECATED - Emergency fallback only
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial documentation |
| 1.1 | Jan 2026 | AI Concierge flow, Smart Cart, Inline Checkout, voice input, enchanting PDF |
| 2.0 | Jan 2026 | **Single flow mandate.** Removed all references to legacy flows as user-accessible options. Clarified graceful degradation means error state, not fallback UI. |

---

## Summary

RoomsOnline has **one booking flow**:

1. User visits property page
2. AI Concierge helps select room and dates
3. Smart Cart shows selection
4. Inline Checkout collects guest info
5. PayFast processes payment
6. Confirmation page with PDF download

There is no alternative. If AI fails, users see an error with contact information—not a different interface.
