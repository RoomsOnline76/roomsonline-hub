
# Plan: Incorporate "Sleep in Africa Like Never Before" Brand Messaging

## Objective

Integrate the brand message **"Sleep in Africa like never before by booking with Sleep in Africa by RoomsOnline"** as a consistent, premium messaging layer throughout the entire booking journey — from the property showcase page through to the confirmation PDF attached to emails.

This is a **messaging/branding enhancement**, not a functional change. The message will be conveyed elegantly at key emotional touchpoints to reinforce the unique value proposition.

---

## Message Touchpoints (7 Integration Points)

### 1. AI Concierge Panel Welcome
**File:** `src/components/booking/AIConciergePanel.tsx`

- **Current:** "Tell me about your ideal stay"
- **Change:** Add brand tagline as subtle intro text when panel is first opened
- **Implementation:** 
  - Update the desktop sidebar header subtitle
  - Add a subtle "Sleep in Africa like never before" tagline below "Your Travel Concierge"
  - Mobile: Show in the collapsed orb tooltip or first message

### 2. Smart Cart Checkout Button Area
**File:** `src/components/booking/SmartCart.tsx`

- **Current:** Plain "Checkout" button
- **Change:** Add micro-copy above or below the checkout CTA
- **Implementation:**
  - Add small text: "Sleep in Africa like never before"
  - Styled as muted, elegant typography (similar to "Secured by PayFast" pattern)

### 3. Inline Checkout Header
**File:** `src/components/booking/InlineCheckout.tsx`

- **Current:** "Checkout" with stay count and price
- **Change:** Add aspirational message in the checkout overlay header
- **Implementation:**
  - Add tagline after the title or as a decorative element
  - Example: "You're about to sleep in Africa like never before"

### 4. Journey Confirmation Page Hero
**File:** `src/pages/JourneyConfirmation.tsx`

- **Current:** "Your Journey is Confirmed!" with property summary
- **Change:** Add brand message as a celebration statement
- **Implementation:**
  - Add below the main heading: "You're about to sleep in Africa like never before"
  - Styled with serif font, editorial feel
  - Reinforce the "Sleep in Africa by RoomsOnline" brand

### 5. Enchanting PDF Brochure
**File:** `supabase/functions/generate-itinerary-pdf/index.ts`

- **Current:** Header shows logo + "Curated African Hospitality" tagline
- **Change:** Replace/enhance tagline with the new brand message
- **Implementation:**
  - Update the `.tagline` class content in the header section
  - Change from "Curated African Hospitality" to "Sleep in Africa like never before"
  - Add footer message: "Thank you for booking with Sleep in Africa by RoomsOnline"

### 6. Confirmation Email Template
**File:** `supabase/functions/send-booking-email/index.ts`

- **Current:** Footer says "RoomsOnline on behalf of [Property]"
- **Change:** Add brand message in the email footer
- **Implementation:**
  - Add tagline before the logo in the footer section
  - "Sleep in Africa like never before"
  - Subtle, elegant positioning

### 7. Itinerary Email Template
**File:** `supabase/functions/send-itinerary-email/index.ts`

- **Current:** Footer says "RoomsOnline – Curated African Hospitality"
- **Change:** Update to the new brand message
- **Implementation:**
  - Replace "Curated African Hospitality" with "Sleep in Africa like never before"
  - Ensure consistency with PDF brochure messaging

---

## Visual Treatment Guidelines

The message should appear with these characteristics:
- **Typography:** Serif font where possible (Playfair Display in PDF, Georgia fallback in emails)
- **Weight:** Light/elegant — not bold or attention-grabbing
- **Color:** Muted foreground or subtle accent (not primary pink unless in PDF)
- **Context:** Appears at moments of decision or celebration, never feels intrusive
- **Variations allowed:**
  - Full: "Sleep in Africa like never before by booking with Sleep in Africa by RoomsOnline"
  - Short: "Sleep in Africa like never before"
  - Sign-off: "Thank you for booking with Sleep in Africa by RoomsOnline"

---

## Technical Changes Summary

| File | Change Type | Notes |
|------|-------------|-------|
| `AIConciergePanel.tsx` | UI text update | Add tagline to header |
| `SmartCart.tsx` | UI text addition | Micro-copy near checkout |
| `InlineCheckout.tsx` | UI text addition | Header tagline |
| `JourneyConfirmation.tsx` | UI text addition | Hero celebration message |
| `generate-itinerary-pdf/index.ts` | HTML template update | Header tagline + footer thank you |
| `send-booking-email/index.ts` | HTML template update | Footer message |
| `send-itinerary-email/index.ts` | HTML template update | Footer message |

---

## Message Consistency Map

```text
Booking Flow Stage          │ Message Variation
────────────────────────────┼──────────────────────────────────────────────────
Property Showcase (start)   │ "Sleep in Africa like never before"
AI Concierge Header         │ "Sleep in Africa like never before"
Smart Cart (pre-checkout)   │ "Sleep in Africa like never before"
Inline Checkout Header      │ "You're about to sleep in Africa like never before"
Confirmation Page           │ "You're about to sleep in Africa like never before"
PDF Brochure Header         │ "Sleep in Africa like never before"
PDF Brochure Footer         │ "Thank you for booking with Sleep in Africa by RoomsOnline"
Confirmation Email Footer   │ "Sleep in Africa like never before"
Itinerary Email Footer      │ "Sleep in Africa like never before"
```

---

## No Functional Changes

This plan involves **zero changes** to:
- Booking logic
- Payment flow
- PMS integration
- State management
- API calls
- Database schema

All changes are cosmetic/branding text updates.
