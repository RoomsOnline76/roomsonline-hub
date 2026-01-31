# RoomsOnline Booking Flow — Complete Developer Reference

> **Last Updated:** January 2026  
> **Version:** 1.1  
> **Audience:** Developers, Technical Architects  
> **Status:** Production

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [User Journey Flowchart](#user-journey-flowchart)
3. [Component Reference](#component-reference)
4. [AI Concierge Panel](#ai-concierge-panel)
5. [Smart Cart](#smart-cart)
6. [Inline Checkout](#inline-checkout)
7. [State Management](#state-management)
8. [Payment Flow](#payment-flow)
9. [Enchanting PDF System](#enchanting-pdf-system)
10. [Delight & Surprise Layer](#delight--surprise-layer)
11. [Database Schema](#database-schema)
12. [Edge Functions Reference](#edge-functions-reference)
13. [Feature Flags](#feature-flags)
14. [Error Handling](#error-handling)
15. [Deprecated Components](#deprecated-components)
16. [Changelog](#changelog)

---

## Architecture Overview

### Design Philosophy

RoomsOnline implements an **AI-First, Frictionless Booking Experience** that transforms the traditional multi-page hotel booking process into a single-page conversational journey. The system prioritizes:

1. **Natural Language Interaction** — Guests describe their ideal stay in plain English
2. **Voice-Powered Input** — Web Speech API enables hands-free booking
3. **Zero Page Navigation** — Entire flow contained within PropertyShowcase page
4. **Proactive Delight** — AI surprises guests with upgrades, tips, and personalized gifts
5. **Enchanting Artifacts** — PDF brochures with poems, maps, and vouchers

### Core Principles

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AI-FIRST BOOKING ENGINE                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │   Benson    │    │  Hostfully  │    │  HotelBeds  │   PMS Layer   │
│   │   Adapter   │    │   Adapter   │    │   Adapter   │                │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                │
│          │                  │                  │                        │
│          └──────────────────┼──────────────────┘                        │
│                             ▼                                           │
│                  ┌─────────────────────┐                               │
│                  │  Unified Booking    │                               │
│                  │      Engine         │                               │
│                  └──────────┬──────────┘                               │
│                             │                                           │
│          ┌──────────────────┼──────────────────┐                       │
│          ▼                  ▼                  ▼                        │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │  AI Parser  │    │   PayFast   │    │  PDF Gen    │                │
│   │  (Lovable)  │    │   Gateway   │    │  (Enchant)  │                │
│   └─────────────┘    └─────────────┘    └─────────────┘                │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Architectural Rules

| Rule | Description |
|------|-------------|
| **PMS-Agnostic** | All bookings flow through unified `bookings` table regardless of source PMS |
| **Payment-First** | PayFast success is REQUIRED before any PMS reservation is created |
| **Live Availability** | AI Concierge always performs live PMS calls (never cached data) |
| **Inline Experience** | No separate checkout pages; accordion expands from Smart Cart |
| **Graceful Fallback** | Legacy flow available if AI components fail |

---

## User Journey Flowchart

### Primary Path (AI Concierge Flow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              HOME PAGE                                   │
│                          (roomsonline.co.za)                            │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     PROPERTY SHOWCASE PAGE                               │
│                       (/property/:slug)                                  │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │                   PROPERTY CONTENT                          │  │ │
│  │  │  • Hero images, description, amenities                      │  │ │
│  │  │  • Room gallery, reviews, location map                      │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │ │
│  │  ┌─────────────────────────────────────────────────────────────┐  │ │
│  │  │              AI CONCIERGE PANEL (Right Side)                │  │ │
│  │  │                                                             │  │ │
│  │  │  COLLAPSED STATE:                                           │  │ │
│  │  │  ┌─────────────────────────────────────────────────────┐   │  │ │
│  │  │  │  ✨ AI Travel Concierge                    [Expand] │   │  │ │
│  │  │  └─────────────────────────────────────────────────────┘   │  │ │
│  │  │                                                             │  │ │
│  │  │  EXPANDED STATE:                                            │  │ │
│  │  │  ┌─────────────────────────────────────────────────────┐   │  │ │
│  │  │  │  Chat Messages                                      │   │  │ │
│  │  │  │  ┌───────────────────────────────────────────────┐  │   │  │ │
│  │  │  │  │ "I'd like 3 nights for 2 adults next week"    │  │   │  │ │
│  │  │  │  └───────────────────────────────────────────────┘  │   │  │ │
│  │  │  │                                                     │   │  │ │
│  │  │  │  Suggestion Cards                                   │   │  │ │
│  │  │  │  ┌───────────────┐ ┌───────────────┐               │   │  │ │
│  │  │  │  │ Deluxe Suite  │ │ Ocean View    │               │   │  │ │
│  │  │  │  │ R2,450/night  │ │ R1,890/night  │               │   │  │ │
│  │  │  │  │ [Add to Cart] │ │ [Add to Cart] │               │   │  │ │
│  │  │  │  └───────────────┘ └───────────────┘               │   │  │ │
│  │  │  │                                                     │   │  │ │
│  │  │  │  ┌───────────────────────────────────────────────┐  │   │  │ │
│  │  │  │  │ Type your request...              [🎤] [Send] │  │   │  │ │
│  │  │  │  └───────────────────────────────────────────────┘  │   │  │ │
│  │  │  └─────────────────────────────────────────────────────┘   │  │ │
│  │  └─────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                    SMART CART (Sticky Bottom)                      │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │ 🛒 Deluxe Suite × 3 nights │ 2 guests │ R7,350 │ [Checkout] │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ [Checkout] clicked
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    INLINE CHECKOUT ACCORDION                             │
│              (Expands from Smart Cart, same page)                        │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  ORDER SUMMARY                                            [−]     │ │
│  │  ├─ Deluxe Suite: 15-18 March 2026                                │ │
│  │  ├─ 3 nights × R2,450 = R7,350                                    │ │
│  │  └─ Total: R7,350                                                 │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │  GUEST DETAILS                                            [−]     │ │
│  │  ├─ Name: [________________]                                      │ │
│  │  ├─ Email: [________________]                                     │ │
│  │  └─ Phone: [________________]                                     │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │  SPECIAL REQUESTS                                         [−]     │ │
│  │  └─ [________________]                                            │ │
│  ├────────────────────────────────────────────────────────────────────┤ │
│  │                                                                    │ │
│  │            ┌─────────────────────────────────────┐                │ │
│  │            │     PAY R7,350 SECURELY             │                │ │
│  │            └─────────────────────────────────────┘                │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ [Pay] clicked
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       PAYFAST MODAL OVERLAY                              │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │                    SECURE PAYMENT                                  │ │
│  │                                                                    │ │
│  │              Amount Due: R7,350.00                                 │ │
│  │                                                                    │ │
│  │  ┌──────────────────────────────────────────────────────────────┐  │ │
│  │  │                   [PayFast Engine]                           │  │ │
│  │  │              Card / EFT / SnapScan                           │  │ │
│  │  └──────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │ │
│  │              Secured by PayFast · SSL Encrypted                   │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ Payment successful
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                      JOURNEY CONFIRMATION PAGE                           │
│                   (/journey/confirmation/:id)                            │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │                                                                    │ │
│  │   Your Journey is Confirmed!                                      │ │
│  │                                                                    │ │
│  │   ┌────────────────────────────────────────────────────────────┐  │ │
│  │   │                  AI SUMMARY                                │  │ │
│  │   │  "Your romantic escape to The Silo awaits! We've          │  │ │
│  │   │   prepared a special surprise for your arrival..."        │  │ │
│  │   └────────────────────────────────────────────────────────────┘  │ │
│  │                                                                    │ │
│  │   Booking Reference: ROL-2026-7X9K                                │ │
│  │   Check-in: Saturday, 15 March 2026 at 14:00                      │ │
│  │   Check-out: Tuesday, 18 March 2026 at 10:00                      │ │
│  │                                                                    │ │
│  │   ┌─────────────────────────────────────────────────────────┐     │ │
│  │   │  Download Your Enchanting Journey Brochure (PDF)        │     │ │
│  │   └─────────────────────────────────────────────────────────┘     │ │
│  │                                                                    │ │
│  │   A confirmation email with your personalized brochure            │ │
│  │   has been sent to guest@example.com                              │ │
│  │                                                                    │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Journey Summary

| Step | Component | User Action | System Response |
|------|-----------|-------------|-----------------|
| 1 | PropertyShowcase | Views property | Displays AI Concierge orb |
| 2 | AIConciergePanel | Types/speaks request | AI parses, shows room suggestions |
| 3 | SuggestionCard | Clicks "Add to Cart" | Item added to Smart Cart |
| 4 | SmartCart | Clicks "Checkout" | Inline accordion expands |
| 5 | InlineCheckout | Enters guest details | Form validates |
| 6 | InlineCheckout | Clicks "Pay" | PayFast modal opens |
| 7 | PayFastModal | Completes payment | ITN callback triggers |
| 8 | System | — | PMS reservation created |
| 9 | JourneyConfirmation | — | PDF generated, email sent |

---

## Component Reference

### Active Components (Production)

| File | Purpose | Lines |
|------|---------|-------|
| `src/components/booking/AIConciergePanel.tsx` | Main conversational interface with voice input | ~750 |
| `src/components/booking/SmartCart.tsx` | Sticky bottom cart bar with real-time totals | ~150 |
| `src/components/booking/InlineCheckout.tsx` | Accordion checkout overlay | ~320 |
| `src/components/booking/VoiceInputButton.tsx` | Web Speech API voice input button | ~80 |
| `src/components/booking/PayFastOnsiteModal.tsx` | PayFast payment modal | ~275 |
| `src/components/booking/LuxuryRoomCard.tsx` | Rich room selection cards | ~200 |
| `src/components/booking/PersonalizedSuggestion.tsx` | AI suggestion display cards | ~150 |
| `src/components/booking/ValueHintBadge.tsx` | Upsell/value indicators | ~50 |
| `src/components/booking/ConciergeErrorBoundary.tsx` | Error boundary for AI components | ~60 |
| `src/components/booking/ConciergeSkeleton.tsx` | Loading state for AI panel | ~40 |

### Supporting Components

| File | Purpose |
|------|---------|
| `src/components/booking/GuestCountStepper.tsx` | Adult/child/infant counter |
| `src/components/booking/BottomSheetDatePicker.tsx` | Mobile-optimized date selection |
| `src/components/booking/ShareBrochureButtons.tsx` | Social sharing for PDF brochures |
| `src/components/booking/PropertyRecommendations.tsx` | AI-powered similar property suggestions |

---

## AI Concierge Panel

### Overview

The AI Concierge Panel is the heart of the booking experience. It provides a conversational interface that understands natural language requests and returns structured booking suggestions.

### Visual States

```
COLLAPSED STATE (Default on page load)
┌─────────────────────────────────────────────────────────────────┐
│  ✨ AI Travel Concierge                                [▼]     │
│  "Tell me about your ideal stay..."                            │
└─────────────────────────────────────────────────────────────────┘

EXPANDED STATE (After click or 8-second inactivity prompt)
┌─────────────────────────────────────────────────────────────────┐
│  ✨ AI Travel Concierge                                [▲]     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Welcome! I'm here to help you plan your perfect stay.     │ │
│  │    Try saying something like:                             │ │
│  │    • "3 nights for 2 adults in March"                     │ │
│  │    • "Romantic weekend getaway"                           │ │
│  │    • "Family trip with 2 kids next month"                 │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ "I'd like 4 nights for 2 adults starting March 15th"      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │ Perfect! I found some great options for you:              │ │
│  │                                                           │ │
│  │  ┌─────────────────────┐  ┌─────────────────────┐        │ │
│  │  │ Deluxe Suite        │  │ Ocean View Room     │        │ │
│  │  │ R2,450/night        │  │ R1,890/night        │        │ │
│  │  │ ════════════════    │  │ ════════════════    │        │ │
│  │  │ Total: R9,800       │  │ Total: R7,560       │        │ │
│  │  │ ✨ Best Value       │  │                     │        │ │
│  │  │ [Add to Cart]       │  │ [Add to Cart]       │        │ │
│  │  └─────────────────────┘  └─────────────────────┘        │ │
│  │                                                           │ │
│  │  I also found a complimentary upgrade available!          │ │
│  │     Want to see it?                                       │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Type your request...                         [🎤] [➤]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Voice Input

The voice input feature uses the Web Speech API for hands-free booking:

```typescript
// src/hooks/useSpeechRecognition.ts
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isSupported, setIsSupported] = useState(false);
  
  // ... implementation
}
```

**Voice Input States:**

| State | Icon | Visual Feedback |
|-------|------|-----------------|
| Idle | Mic (outline) | Static microphone icon |
| Listening | Mic (filled, red) | Pulsing animation, "Listening..." text |
| Processing | Loading | Loading spinner |
| Error | Warning | Error toast notification |

**Browser Support:**
- Chrome, Edge, Safari (full support)
- Firefox (limited, speech recognition API not fully implemented)
- Fallback: Button hidden on unsupported browsers

### Natural Language Examples

The AI Concierge understands various booking request formats:

| User Input | Parsed Intent |
|------------|---------------|
| "4 nights for 2 adults in March" | `{ nights: 4, adults: 2, month: "March" }` |
| "Weekend getaway for a family with 2 kids" | `{ nights: 2, adults: 2, children: 2, type: "weekend" }` |
| "Romantic week in April" | `{ nights: 7, adults: 2, month: "April", vibe: "romantic" }` |
| "Next weekend, 3 people" | `{ nights: 2, adults: 3, dates: "next weekend" }` |
| "Cheapest room for tonight" | `{ nights: 1, adults: 1, sort: "price_asc", start: "today" }` |

### Proactive Surprise Injection

The AI Concierge delivers 1-2 "delights" per session to enhance the booking experience:

```typescript
// Surprise injection logic
const SURPRISE_TRIGGERS = [
  {
    condition: "booking_total > 5000",
    message: "I've found a complimentary upgrade to our Sunset Suite — want to see it?",
    type: "upgrade"
  },
  {
    condition: "nights >= 3",
    message: "As a thank you for your extended stay, I can add a free breakfast for one morning!",
    type: "addon"
  },
  {
    condition: "vibe === 'romantic'",
    message: "I've arranged a special welcome: chilled champagne and roses in your room!",
    type: "gift"
  }
];
```

### Inactivity Prompt

After 8 seconds of inactivity on the property page, the AI Concierge proactively offers help:

```
┌───────────────────────────────────────────────────────────────┐
│ Need help planning your stay? I can find the perfect room    │
│    for your dates and group size. Just ask!                  │
│                                        [Ask AI] [Dismiss]    │
└───────────────────────────────────────────────────────────────┘
```

---

## Smart Cart

### Overview

The Smart Cart is a sticky bottom bar that provides real-time visibility into the booking selection. It serves as both a summary display and the gateway to checkout.

### Visual Structure

```
EMPTY STATE (No items)
[Cart is hidden - no visual element]

WITH ITEMS
┌─────────────────────────────────────────────────────────────────┐
│ 🛒 1  │ Deluxe Suite              │ 🌙 3 │ 👤 2 │ R7,350 │ [▲] │ [ Checkout ]│
└─────────────────────────────────────────────────────────────────┘
  ^        ^                            ^     ^      ^        ^
  |        |                            |     |      |        |
 Badge   Room name                    Nights Guests Total   Expand

EXPANDED STATE (After clicking expand)
┌─────────────────────────────────────────────────────────────────┐
│ 🛒 1  │ Deluxe Suite              │ 🌙 3 │ 👤 2 │ R7,350 │ [▼] │ [ Checkout ]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [Image] │ Deluxe Suite                                  │   │
│  │         │ 15 Mar - 18 Mar 2026 · 3 nights               │   │
│  │         │ R7,350                             [Remove]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Total (1 stay)                                      R7,350    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Multi-Property Journey

When booking across multiple properties:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🛒 2  │ The Silo, Benson...       │ 🌙 7 │ 👤 2 │ R45,200│ [▲] │ [ Checkout ]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [Image] │ The Silo Hotel                                │   │
│  │         │ Presidential Suite                            │   │
│  │         │ 15 Mar - 18 Mar 2026 · 3 nights               │   │
│  │         │ R28,500                            [Remove]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ [Image] │ Benson House                                  │   │
│  │         │ Garden Suite                                  │   │
│  │         │ 18 Mar - 22 Mar 2026 · 4 nights               │   │
│  │         │ R16,700                            [Remove]   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Total (2 stays)                                     R45,200   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Inline Checkout

### Overview

The Inline Checkout replaces separate checkout pages with an accordion that expands from the Smart Cart. The entire checkout process happens without leaving the property page.

### Accordion Sections

```typescript
interface CheckoutSection {
  id: "summary" | "guest" | "requests" | "payment";
  title: string;
  icon: LucideIcon;
  isExpanded: boolean;
  isComplete: boolean;
}
```

### Visual Flow

```
STEP 1: Order Summary (Auto-expanded on checkout click)
┌─────────────────────────────────────────────────────────────────┐
│ Order Summary                                            [−]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  The Silo Hotel · Presidential Suite                           │
│  ├─ Check-in: Saturday, 15 March 2026 at 14:00                 │
│  ├─ Check-out: Tuesday, 18 March 2026 at 10:00                 │
│  ├─ 3 nights × R9,500 = R28,500                                │
│  └─ Guests: 2 adults                                           │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│  Subtotal                                            R28,500   │
│  VAT (15%)                                            R4,275   │
│  ─────────────────────────────────────────────────────────────  │
│  Total                                               R32,775   │
│                                                                 │
│                                              [Continue →]       │
└─────────────────────────────────────────────────────────────────┘

STEP 2: Guest Details
┌─────────────────────────────────────────────────────────────────┐
│ ✓ Order Summary                                          [+]   │
├─────────────────────────────────────────────────────────────────┤
│ Guest Details                                            [−]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Full Name *                                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Sarah Johnson                                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Email Address *                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ sarah@example.com                                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Phone Number *                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ +27 82 123 4567                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                              [Continue →]       │
└─────────────────────────────────────────────────────────────────┘

STEP 3: Special Requests (Optional)
┌─────────────────────────────────────────────────────────────────┐
│ ✓ Order Summary                                          [+]   │
│ ✓ Guest Details                                          [+]   │
├─────────────────────────────────────────────────────────────────┤
│ Special Requests                                         [−]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Any special requests or requirements?                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ We're celebrating our anniversary. Could we have        │   │
│  │ a room with a view if possible?                         │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Voucher Code (Optional)                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ SUNSET25                                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│                                    [Continue to Payment →]      │
└─────────────────────────────────────────────────────────────────┘

STEP 4: Payment
┌─────────────────────────────────────────────────────────────────┐
│ ✓ Order Summary                                          [+]   │
│ ✓ Guest Details                                          [+]   │
│ ✓ Special Requests                                       [+]   │
├─────────────────────────────────────────────────────────────────┤
│ Payment                                                  [−]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                 ┌─────────────────────────────┐                │
│                 │                             │                │
│                 │   PAY R32,775 SECURELY      │                │
│                 │                             │                │
│                 └─────────────────────────────┘                │
│                                                                 │
│              Secured by PayFast · SSL Encrypted                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Guest Details Persistence

Guest information is automatically saved to localStorage for return visitors:

```typescript
// localStorage key: rol_guest_details
interface StickyGuestDetails {
  name: string;
  email: string;
  phone: string;
  lastUpdated: string; // ISO timestamp
}

// Auto-sync on input blur
const handleBlur = () => {
  localStorage.setItem('rol_guest_details', JSON.stringify({
    name: guestName,
    email: guestEmail,
    phone: guestPhone,
    lastUpdated: new Date().toISOString()
  }));
};
```

---

## State Management

### Context Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        App.tsx                                   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                   ItineraryProvider                       │ │
│  │  • stays: ItineraryStay[]                                 │ │
│  │  • totalPrice, totalNights                                │ │
│  │  • addStay(), removeStay(), clearItinerary()              │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │              MobileBookingProvider                  │ │ │
│  │  │  • checkIn, checkOut                                │ │ │
│  │  │  • rooms: BookingRoom[]                             │ │ │
│  │  │  • guestDetails                                     │ │ │
│  │  │  • totalCost                                        │ │ │
│  │  │                                                     │ │ │
│  │  │  ┌───────────────────────────────────────────────┐ │ │ │
│  │  │  │            CurrencyProvider                   │ │ │ │
│  │  │  │  • currency: "ZAR" | "USD" | "EUR" | "GBP"    │ │ │ │
│  │  │  │  • formatPrice()                              │ │ │ │
│  │  │  │                                               │ │ │ │
│  │  │  │  ┌─────────────────────────────────────────┐ │ │ │ │
│  │  │  │  │        PropertyShowcase                 │ │ │ │ │
│  │  │  │  │  • AIConciergePanel                     │ │ │ │ │
│  │  │  │  │  • SmartCart                            │ │ │ │ │
│  │  │  │  │  • InlineCheckout                       │ │ │ │ │
│  │  │  │  └─────────────────────────────────────────┘ │ │ │ │
│  │  │  └───────────────────────────────────────────────┘ │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### ItineraryContext Data Structure

```typescript
interface ItineraryStay {
  id: string;                    // UUID
  property_id: string;
  property_name: string;
  property_slug: string;
  property_image?: string;
  rooms: Array<{
    room_type_id: string;
    room_type_name: string;
    rate_per_night: number;
    quantity: number;
  }>;
  dates: {
    check_in: string;           // YYYY-MM-DD
    check_out: string;          // YYYY-MM-DD
  };
  nights: number;
  guests: {
    adults: number;
    children: number;
    infants: number;
  };
  price_breakdown: {
    room_total: number;
    taxes: number;
    fees: number;
    total: number;
  };
  ai_metadata?: {
    suggestion_source: "ai" | "manual";
    prompt_text?: string;
    surprise_applied?: string;
  };
}
```

### localStorage Keys

| Key | Purpose | TTL |
|-----|---------|-----|
| `rol_guest_details` | Sticky guest name, email, phone | Permanent |
| `rol_itinerary` | Multi-property journey state | 24 hours |
| `rol_currency` | User's preferred currency | Permanent |
| `mobile_booking_state` | MobileBookingContext snapshot | Session |

---

## Payment Flow

### PayFast Onsite Integration

```
┌─────────────────────────────────────────────────────────────────┐
│                     PAYMENT FLOW SEQUENCE                        │
└─────────────────────────────────────────────────────────────────┘

     Frontend                    Edge Function               PayFast
        │                            │                          │
        │  1. Click "Pay"            │                          │
        │──────────────────────────► │                          │
        │                            │  2. Request UUID         │
        │                            │─────────────────────────►│
        │                            │                          │
        │                            │  3. Return UUID          │
        │                            │◄─────────────────────────│
        │  4. UUID received          │                          │
        │◄──────────────────────────│                          │
        │                            │                          │
        │  5. Open PayFast Modal     │                          │
        │────────────────────────────────────────────────────►│
        │                            │                          │
        │                            │  6. ITN Callback         │
        │                            │◄─────────────────────────│
        │                            │                          │
        │                            │  7. Update booking       │
        │                            │  8. Push to PMS          │
        │                            │  9. Generate PDF         │
        │                            │  10. Send email          │
        │                            │                          │
        │  11. Redirect to confirm   │                          │
        │◄─────────────────────────────────────────────────────│
        │                            │                          │
```

### PayFast Modal States

```typescript
// PayFastOnsiteModal.tsx state machine
type PayFastState = 
  | "loading"         // Fetching UUID from edge function
  | "ready"           // UUID received, waiting for user
  | "active"          // PayFast popup is open
  | "success"         // Payment completed
  | "cancelled"       // User closed modal
  | "error";          // API or network error
```

### ITN (Instant Transaction Notification) Callback

The `payfast-api` edge function handles ITN callbacks:

```typescript
// POST /payfast-api { action: "itn_callback" }
async function handleITN(payload: PayFastITN) {
  // 1. Validate signature
  const isValid = await validatePayFastSignature(payload);
  
  // 2. Update booking payment status
  await supabase.from("bookings").update({
    payment_status: payload.payment_status,
    payment_reference: payload.pf_payment_id,
    paid_at: new Date().toISOString()
  }).eq("id", payload.m_payment_id);
  
  // 3. Trigger PMS push (async)
  await supabase.functions.invoke("push-booking", {
    body: { booking_id: payload.m_payment_id }
  });
  
  // 4. Generate enchanting PDF
  await supabase.functions.invoke("generate-itinerary-pdf", {
    body: { booking_id: payload.m_payment_id }
  });
  
  // 5. Send confirmation email
  await supabase.functions.invoke("send-booking-email", {
    body: { booking_id: payload.m_payment_id }
  });
}
```

---

## Enchanting PDF System

### Overview

The `generate-itinerary-pdf` edge function creates a personalized, visually stunning PDF brochure that transforms a booking confirmation into a treasured keepsake.

### PDF Document Structure

```
┌─────────────────────────────────────────────────────────────────┐
│                         PAGE 1: COVER                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │                    [HERO IMAGE]                           │ │
│  │               Property at Golden Hour                     │ │
│  │                                                           │ │
│  │  ═══════════════════════════════════════════════════════ │ │
│  │                                                           │ │
│  │              Welcome, Sarah & Michael                     │ │
│  │                                                           │ │
│  │         "Your romantic escape to The Silo awaits.         │ │
│  │          Cape Town's sunset has been preparing            │ │
│  │          for your arrival."                               │ │
│  │                                                           │ │
│  │                    — Your AI Concierge                    │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    PAGE 2: PERSONALIZED POEM                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │                    ✨ For You ✨                          │ │
│  │                                                           │ │
│  │         Where Table Mountain meets the sea,               │ │
│  │         Two hearts find sanctuary.                        │ │
│  │         In Silo's embrace, love takes flight—             │ │
│  │         Cape Town dreams on a summer night.               │ │
│  │                                                           │ │
│  │                                                           │ │
│  │  ─────────────────────────────────────────────────────── │ │
│  │                                                           │ │
│  │  This poem was crafted by AI just for your journey,       │ │
│  │  inspired by your destination and travel dates.           │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   PAGE 3: ITINERARY TIMELINE                     │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  Your Journey                                             │ │
│  │                                                           │ │
│  │  ────●──────────────────────────────────────────●────── │ │
│  │      │                                          │        │ │
│  │  SAT 15 MAR                               TUE 18 MAR     │ │
│  │  Check-in 14:00                          Check-out 10:00 │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │                                                     │ │ │
│  │  │  The Silo Hotel                                     │ │ │
│  │  │     Presidential Suite                              │ │ │
│  │  │     3 nights · 2 guests                             │ │ │
│  │  │                                                     │ │ │
│  │  │  Silo District, V&A Waterfront                      │ │ │
│  │  │  +27 21 670 0500                                    │ │ │
│  │  │                                                     │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  │  Booking Reference: ROL-2026-7X9K                        │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   PAGE 4: WEATHER FORECAST                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  Cape Town Weather Forecast                               │ │
│  │                                                           │ │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐                │ │
│  │  │ SAT │ │ SUN │ │ MON │ │ TUE │ │ WED │                │ │
│  │  │ ☀️  │ │ 🌤️  │ │ ☀️  │ │ ☀️  │ │ 🌤️  │                │ │
│  │  │ 28° │ │ 26° │ │ 29° │ │ 27° │ │ 25° │                │ │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘                │ │
│  │                                                           │ │
│  │  Perfect weather for sundowners at the rooftop bar!       │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   PAGE 5: LOCAL DISCOVERIES                      │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  Local Discoveries                                        │ │
│  │                                                           │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │                                                     │ │ │
│  │  │              [STATIC MAP IMAGE]                     │ │ │
│  │  │                                                     │ │ │
│  │  │     The Silo Hotel                                  │ │ │
│  │  │     Gigi Rooftop (0.5 km)                           │ │ │
│  │  │     Camps Bay Beach (8 km)                          │ │ │
│  │  │     Table Mountain Cableway (6 km)                  │ │ │
│  │  │                                                     │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │                                                           │ │
│  │  Curated by your AI Concierge:                           │ │
│  │  • Secret sunset spot at Signal Hill                     │ │
│  │  • Best braai at Mzoli's (locals only!)                  │ │
│  │  • Morning coffee at Truth Coffee Roasting               │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   PAGE 6: SURPRISE VOUCHER                       │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │  ╔═══════════════════════════════════════════════════╗   │ │
│  │  ║                                                   ║   │ │
│  │  ║   A SPECIAL GIFT FOR YOU                          ║   │ │
│  │  ║                                                   ║   │ │
│  │  ║   ───────────────────────────────────────────     ║   │ │
│  │  ║                                                   ║   │ │
│  │  ║         25% OFF                                   ║   │ │
│  │  ║   Table Mountain Cable Car Tickets                ║   │ │
│  │  ║                                                   ║   │ │
│  │  ║   ┌─────────────┐                                 ║   │ │
│  │  ║   │   [QR CODE] │  Code: SILO-SUNSET-2026        ║   │ │
│  │  ║   └─────────────┘                                 ║   │ │
│  │  ║                                                   ║   │ │
│  │  ║   Valid: 15 Mar - 30 Apr 2026                     ║   │ │
│  │  ║   Show this voucher at the ticket office          ║   │ │
│  │  ║                                                   ║   │ │
│  │  ╚═══════════════════════════════════════════════════╝   │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     PAGE 7: THANK YOU                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │                                                           │ │
│  │                    Thank You                              │ │
│  │                                                           │ │
│  │         for choosing RoomsOnline for your journey.        │ │
│  │                                                           │ │
│  │         We can't wait to host you in Cape Town.           │ │
│  │         May your stay be filled with wonder.              │ │
│  │                                                           │ │
│  │                                                           │ │
│  │                    [ROL LOGO]                             │ │
│  │                                                           │ │
│  │              www.roomsonline.co.za                        │ │
│  │              hello@roomsonline.co.za                      │ │
│  │              +27 21 555 1234                              │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### PDF Generation Flow

```typescript
// generate-itinerary-pdf edge function
async function generateEnchantingPDF(bookingId: string) {
  // 1. Fetch booking + property data
  const booking = await fetchBookingWithProperty(bookingId);
  
  // 2. Generate personalized poem via Lovable AI
  const poem = await generatePoem({
    guestName: booking.guest_name,
    propertyName: booking.property.name,
    location: booking.property.city,
    vibe: booking.ai_metadata?.vibe || "romantic"
  });
  
  // 3. Fetch 5-day weather forecast
  const weather = await fetchWeatherForecast(
    booking.property.latitude,
    booking.property.longitude,
    booking.check_in_date
  );
  
  // 4. Generate static map with POIs
  const mapUrl = generateStaticMapUrl({
    center: [booking.property.latitude, booking.property.longitude],
    markers: [
      { lat: booking.property.latitude, lng: booking.property.longitude, label: "P" },
      ...nearbyPOIs.map((poi, i) => ({ ...poi, label: String(i + 1) }))
    ]
  });
  
  // 5. Create surprise voucher
  const voucher = await createExperienceVoucher({
    bookingId,
    discountPercent: 25,
    description: "Table Mountain Cable Car Tickets",
    validUntil: addDays(parseISO(booking.check_out_date), 45)
  });
  
  // 6. Render HTML template
  const html = renderPDFTemplate({
    booking,
    poem,
    weather,
    mapUrl,
    voucher,
    localTips: await fetchLocalExperiences(booking.property_id)
  });
  
  // 7. Convert to PDF
  const pdfBuffer = await htmlToPdf(html);
  
  // 8. Upload to storage
  const pdfUrl = await uploadToStorage(pdfBuffer, `brochures/${bookingId}.pdf`);
  
  // 9. Update booking with surprise elements
  await supabase.from("bookings").update({
    surprise_elements: {
      poem: poem,
      voucher_code: voucher.code,
      map_url: mapUrl,
      image_urls: [heroImageUrl, localGemImageUrl]
    }
  }).eq("id", bookingId);
  
  return pdfUrl;
}
```

### AI Poem Generation

```typescript
// Using Lovable AI (Gemini 2.5 Flash)
async function generatePoem(context: PoemContext): Promise<string> {
  const prompt = `
    Write a 4-line rhyming poem for a guest named ${context.guestName} 
    who is visiting ${context.propertyName} in ${context.location}.
    The vibe is ${context.vibe}. Make it warm, memorable, and Cape Town-flavored.
    Do not use generic phrases. Be specific and evocative.
  `;
  
  const response = await fetch("https://api.lovable.dev/v1/ai/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 150
    })
  });
  
  const data = await response.json();
  return data.choices[0].message.content.trim();
}
```

---

## Delight & Surprise Layer

### Philosophy

Every booking should feel like receiving a gift, not completing a transaction. The Delight & Surprise Layer injects moments of joy throughout the journey.

### Surprise Injection Points

| Point | Trigger | Example Surprise |
|-------|---------|------------------|
| AI Concierge | Booking total > R5,000 | "I've found a complimentary upgrade to our Sunset Suite!" |
| AI Concierge | Stay >= 3 nights | "As a thank you, I can add a free breakfast for one morning!" |
| AI Concierge | Romantic vibe detected | "I've arranged chilled champagne and roses for your arrival!" |
| PDF Generation | All bookings | Personalized poem + surprise voucher |
| Confirmation Email | All bookings | "A special surprise awaits in your room..." |

### Cape Town-Flavored Examples

```typescript
const CAPE_TOWN_SURPRISES = [
  {
    type: "voucher",
    title: "Sunset Sundowner Experience",
    description: "Complimentary cocktail at Signal Hill sunset spot",
    validDays: 30
  },
  {
    type: "voucher",
    title: "Table Mountain Adventure",
    description: "25% off cable car tickets",
    discountPercent: 25,
    validDays: 45
  },
  {
    type: "experience",
    title: "Private Braai Experience",
    description: "Traditional South African barbecue for two at Mzoli's",
    value: "R500 credit"
  },
  {
    type: "tip",
    title: "Secret Local Spot",
    description: "Ask the concierge about the hidden coffee shop at Woodstock..."
  }
];
```

### Experience Vouchers Table

```sql
CREATE TABLE experience_vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID REFERENCES itineraries(id),
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  discount_percent INTEGER,
  valid_until TIMESTAMPTZ,
  redeemed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Example voucher
INSERT INTO experience_vouchers (itinerary_id, code, description, discount_percent, valid_until)
VALUES (
  'abc-123',
  'SILO-SUNSET-2026',
  '25% off Table Mountain Cable Car Tickets',
  25,
  '2026-04-30'
);
```

---

## Database Schema

### Core Tables

#### `bookings`

```sql
CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  
  -- Guest Information
  guest_name VARCHAR(255) NOT NULL,
  guest_email VARCHAR(255) NOT NULL,
  guest_phone VARCHAR(50),
  
  -- Booking Details
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  adults INTEGER DEFAULT 1,
  children INTEGER DEFAULT 0,
  teens INTEGER DEFAULT 0,
  infants INTEGER DEFAULT 0,
  
  -- Room Selection
  room_type_id UUID,
  rooms JSONB,  -- Array of room selections for multi-room bookings
  rate_type_id UUID,
  
  -- Pricing
  total_price DECIMAL(10,2) NOT NULL,
  charges_breakdown JSONB,
  
  -- Payment
  payment_status VARCHAR(50) DEFAULT 'pending',
  payment_method VARCHAR(50),
  payment_reference VARCHAR(255),
  payment_intent_id VARCHAR(255),
  paid_at TIMESTAMPTZ,
  
  -- PMS Integration
  external_reservation_id VARCHAR(255),
  booking_channel VARCHAR(50) DEFAULT 'direct',
  requires_intervention BOOLEAN DEFAULT false,
  
  -- AI & Personalization
  ai_metadata JSONB,           -- { suggestion_source, prompt_text, model_used }
  surprise_elements JSONB,     -- { poem, voucher_code, map_url, image_urls[] }
  special_requests TEXT,
  special_requests_parsed JSONB,
  voucher VARCHAR(100),
  
  -- Status & Audit
  status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `itineraries`

```sql
CREATE TABLE itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  session_id VARCHAR(255),
  
  -- Journey Details
  title VARCHAR(255),
  stays JSONB NOT NULL DEFAULT '[]',  -- Array of ItineraryStay objects
  total_nights INTEGER DEFAULT 0,
  total_price DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'ZAR',
  
  -- Guest Information
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),
  guest_phone VARCHAR(50),
  special_requests TEXT,
  
  -- Brochure
  brochure_pdf_url TEXT,
  brochure_generated_at TIMESTAMPTZ,
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',  -- draft, confirmed, cancelled
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

#### `itinerary_bookings`

```sql
CREATE TABLE itinerary_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID REFERENCES itineraries(id) NOT NULL,
  booking_id UUID REFERENCES bookings(id) NOT NULL,
  property_id UUID REFERENCES properties(id),
  stay_index INTEGER NOT NULL,
  
  -- Sync Status
  status VARCHAR(50) DEFAULT 'pending',  -- pending, confirmed, failed
  external_reservation_id VARCHAR(255),
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### AI Metadata Structure

```typescript
// bookings.ai_metadata JSONB
interface BookingAIMetadata {
  suggestion_source: "ai" | "manual" | "upsell";
  prompt_text?: string;           // Original user request
  model_used?: string;            // e.g., "google/gemini-2.5-flash"
  confidence_score?: number;      // 0-1 score from AI parsing
  alternatives_shown?: string[];  // IDs of alternative suggestions shown
  surprise_applied?: {
    type: string;
    description: string;
    value?: number;
  };
  poem_seed?: string;             // Vibe used for poem generation
}
```

### Surprise Elements Structure

```typescript
// bookings.surprise_elements JSONB
interface SurpriseElements {
  poem: string;                   // 4-line personalized poem
  voucher_code: string;           // e.g., "SILO-SUNSET-2026"
  voucher_description: string;    // e.g., "25% off Table Mountain..."
  voucher_valid_until: string;    // ISO date
  map_url: string;                // Static Google Maps URL
  image_urls: string[];           // Array of curated images
  local_tips: string[];           // AI-generated local recommendations
}
```

---

## Edge Functions Reference

| Function | Method | Description |
|----------|--------|-------------|
| `ai-booking-concierge` | POST | Parses natural language via Lovable AI, always performs live PMS adapter calls (never cache), returns structured suggestions + date alternatives + upsells |
| `generate-itinerary-pdf` | POST | Enhanced PDF generation with AI personalization: poem, weather forecast, map, voucher, local tips |
| `push-booking` | POST | Verifies live availability + creates PMS reservation (Benson, Hostfully, HotelBeds) |
| `multi-push-booking` | POST | Atomic sequential booking creation with rollback on failure |
| `payfast-api` | POST | Payment initiation (get UUID) and ITN callback handling |
| `send-itinerary-email` | POST | Confirmation email with enchanting PDF attachment |
| `validate-itinerary-availability` | POST | Pre-checkout availability check across all stays |
| `hostfully-api` | POST | Hostfully PMS integration (buildings, rooms, availability, bookings) |
| `benson-api` | POST | Benson Property system integration |
| `hotelbeds-api` | POST | HotelBeds integration |
| `parse-special-requests` | POST | AI parsing of special requests into structured format |
| `calculate-commission` | POST | Commission calculation for property owners |

### AI Booking Concierge Details

```typescript
// POST /ai-booking-concierge
interface ConciergeRequest {
  message: string;              // Natural language input
  property_id: string;          // Current property context
  property_slug: string;
  context?: {
    previous_messages?: Message[];
    selected_dates?: { check_in: string; check_out: string };
    guest_counts?: { adults: number; children: number; infants: number };
  };
}

interface ConciergeResponse {
  success: boolean;
  response: {
    message: string;            // AI response text
    suggestions: RoomSuggestion[];
    alternatives?: DateAlternative[];
    upsells?: Upsell[];
    surprise?: {
      type: "upgrade" | "addon" | "gift";
      message: string;
      value?: number;
    };
  };
  parsed_intent: {
    nights: number;
    adults: number;
    children: number;
    infants: number;
    check_in?: string;
    check_out?: string;
    vibe?: string;
  };
}
```

---

## Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| `AI_CONCIERGE_ENABLED` | `true` | Enables AI Concierge panel on PropertyShowcase |
| `VOICE_INPUT_ENABLED` | `true` | Enables Web Speech API voice input button |
| `ENHANCED_PDF_ENABLED` | `true` | Enables AI-enhanced PDF brochures with poem, map, voucher |
| `PROACTIVE_SURPRISES_ENABLED` | `true` | Enables AI surprise injection during booking |
| `WEATHER_FORECAST_ENABLED` | `true` | Includes weather forecast in PDF |
| `EXPERIENCE_VOUCHERS_ENABLED` | `true` | Generates surprise vouchers in PDF |

### Accessing Feature Flags

```typescript
// src/hooks/useFeatureFlags.tsx
export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlags>({
    AI_CONCIERGE_ENABLED: true,
    VOICE_INPUT_ENABLED: true,
    ENHANCED_PDF_ENABLED: true,
    // ... defaults
  });

  useEffect(() => {
    supabase.functions.invoke("get-feature-flags")
      .then(({ data }) => setFlags(prev => ({ ...prev, ...data })))
      .catch(() => {
        // Fail silently, use defaults
      });
  }, []);

  return flags;
}
```

---

## Error Handling

### Component Error Boundary

```typescript
// ConciergeErrorBoundary.tsx
export class ConciergeErrorBoundary extends Component<Props, State> {
  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      // Fallback to legacy booking flow
      return <LegacyBookingFallback propertyId={this.props.propertyId} />;
    }
    return this.props.children;
  }
}
```

### Error Scenarios

| Error | Handling | User Experience |
|-------|----------|-----------------|
| AI parse failure | Retry with simplified prompt | "I didn't catch that. Could you try something like '2 nights for 2 adults'?" |
| PMS unavailable | Show cached rates (if available) | "Live rates unavailable. Showing estimated pricing." |
| Payment failure | Display PayFast error | Error toast + retry button |
| `AVAILABILITY_CHANGED` | DateReselectDialog | "These dates are no longer available. Please select new dates." |
| PMS push failure | Mark booking as 'failed' | Error details + contact support prompt |
| PDF generation failure | Send confirmation without PDF | Email sent without attachment + async retry |

### Availability Change Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    DateReselectDialog                            │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                                                           │ │
│  │   Dates No Longer Available                               │ │
│  │                                                           │ │
│  │   The room you selected is no longer available for        │ │
│  │   15-18 March 2026.                                       │ │
│  │                                                           │ │
│  │   Available alternatives:                                 │ │
│  │   • 16-19 March 2026 (same price)                        │ │
│  │   • 22-25 March 2026 (R200 less)                         │ │
│  │                                                           │ │
│  │   [Select New Dates]              [Cancel Booking]        │ │
│  │                                                           │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deprecated Components

The following components are retained for backward compatibility but are **NOT part of the primary booking flow**:

| Component | Status | Fallback Trigger |
|-----------|--------|------------------|
| `QuickBookDrawer.tsx` | Deprecated | `AI_CONCIERGE_ENABLED=false` |
| `FloatingDateGuestPicker.tsx` | Deprecated | `AI_CONCIERGE_ENABLED=false` |
| `/journey/review` route | Bypassed | Never used in AI flow |
| `/journey/checkout` route | Bypassed | Never used in AI flow |

### Legacy Flow Activation

```typescript
// PropertyShowcase.tsx
const { AI_CONCIERGE_ENABLED } = useFeatureFlags();

return (
  <ConciergeErrorBoundary
    propertyId={property.id}
    fallback={<LegacyBookingFlow property={property} />}
  >
    {AI_CONCIERGE_ENABLED ? (
      <>
        <AIConciergePanel property={property} />
        <SmartCart onCheckout={handleInlineCheckout} />
      </>
    ) : (
      <LegacyBookingFlow property={property} />
    )}
  </ConciergeErrorBoundary>
);
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | January 2026 | Initial complete documentation |
| 1.1 | January 2026 | Full inline AI Concierge + Smart Cart flow, voice input via Web Speech API, deprecated QuickBookDrawer & separate checkout pages, enchanting personalized PDF with poem, weather, visuals, map + QR voucher, proactive surprise injection, Cape Town-flavored delight layer |

---

## Quick Reference

### File Locations

```
src/
├── components/
│   └── booking/
│       ├── AIConciergePanel.tsx      # Main AI interface
│       ├── SmartCart.tsx             # Sticky cart bar
│       ├── InlineCheckout.tsx        # Accordion checkout
│       ├── VoiceInputButton.tsx      # Web Speech API
│       ├── PayFastOnsiteModal.tsx    # Payment modal
│       ├── LuxuryRoomCard.tsx        # Room selection
│       ├── PersonalizedSuggestion.tsx# AI suggestions
│       ├── ConciergeErrorBoundary.tsx# Error handling
│       └── ConciergeSkeleton.tsx     # Loading state
├── contexts/
│   ├── ItineraryContext.tsx          # Journey state
│   ├── MobileBookingContext.tsx      # Booking state
│   └── CurrencyContext.tsx           # Currency formatting
├── hooks/
│   ├── useSpeechRecognition.ts       # Voice input hook
│   └── useFeatureFlags.tsx           # Feature flag access
└── pages/
    ├── PropertyShowcase.tsx          # Main booking page
    └── JourneyConfirmation.tsx       # Confirmation page

supabase/functions/
├── ai-booking-concierge/             # Natural language parsing
├── generate-itinerary-pdf/           # Enchanting PDF generation
├── push-booking/                     # PMS reservation sync
├── multi-push-booking/               # Multi-property atomic booking
├── payfast-api/                      # Payment handling
├── send-itinerary-email/             # Confirmation emails
└── validate-itinerary-availability/  # Pre-checkout validation
```

### Key URLs

| Route | Purpose |
|-------|---------|
| `/property/:slug` | Property showcase + AI booking |
| `/journey/confirmation/:id` | Booking confirmation |
| `/book` | Property listing (browse) |

---

*This document is the authoritative reference for the RoomsOnline booking system. For questions or updates, contact the development team.*
