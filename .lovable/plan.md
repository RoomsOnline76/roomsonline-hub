
# Plan: Complete Rewrite of booking-flow-complete.md

## Objective

Create a new, authoritative developer reference document that reflects the **AI Concierge-first booking flow** as the primary system architecture. The document will deprecate legacy components (QuickBookDrawer, FloatingDateGuestPicker, separate /journey pages) and present the unified, inline booking experience as the definitive RoomsOnline booking process.

## Document Structure

The rewritten document will include:

### 1. Header & Metadata
- Title: "RoomsOnline Booking Flow — Complete Developer Reference"
- Last Updated: January 2026
- Version: 1.1
- Audience: Developers, Technical Architects

### 2. Architecture Overview (Revised)
- **AI-First Design Philosophy**: Natural language + voice-powered booking
- **PMS-Agnostic Engine**: Benson, Hostfully, HotelBeds, NightsBridge adapters
- **Payment-First Logic**: PayFast success required before PMS sync
- **Unified Data Model**: All bookings → `bookings` + `itineraries` tables
- **Inline Experience**: No separate checkout pages; accordion-based flow

### 3. User Journey Flowchart (Completely Rewritten)
Primary path (ASCII diagram):
```
Home → PropertyShowcase (/property/:slug)
    ├─ AI Concierge Panel (persistent, chat + voice)
    │   └─ Collapsed: "✨ AI Travel Concierge" orb/button
    │   └─ Expanded: Chat interface + mic icon
    ├─ Smart Cart (sticky bottom bar, real-time preview)
    └─ Inline Checkout Accordion (expands from Smart Cart)
        ├─ Order Summary (collapsible)
        ├─ Guest Details Form
        ├─ Special Requests
        └─ Pay Button → PayFast Modal Overlay
            ↓
JourneyConfirmation (/journey/confirmation/:id)
    └─ AI-generated summary + enchanting PDF download
```

### 4. Component Reference (Updated File Locations)
- **Active Components**:
  - `AIConciergePanel.tsx` - Natural language + voice input
  - `SmartCart.tsx` - Sticky bottom bar with cart preview
  - `InlineCheckout.tsx` - Accordion checkout overlay
  - `VoiceInputButton.tsx` - Web Speech API integration
  - `PayFastOnsiteModal.tsx` - Payment modal
- **Deprecated Components** (marked as legacy fallback):
  - `QuickBookDrawer.tsx` - Only used if AI_CONCIERGE_ENABLED=false
  - `FloatingDateGuestPicker.tsx` - Only used if AI_CONCIERGE_ENABLED=false
  - Separate `/journey/review` and `/journey/checkout` routes - Bypassed entirely

### 5. AI Concierge Panel Features (New Section)
- Default collapsed state with subtle "✨ AI Travel Concierge" orb
- Web Speech API voice input (mic icon, start/stop, real-time transcription)
- Natural language parsing examples:
  - "4 nights for 2 adults in March"
  - "Weekend getaway for a family with 2 kids"
  - "Romantic week in April"
- Proactive surprise injection (1-2 delights per session)
  - Example: "I've found a complimentary upgrade – want to see it?"
- 8-second inactivity prompt trigger
- Suggestion cards with:
  - Date alternatives
  - Room options with live pricing
  - Upsells and value badges

### 6. State Management (Updated)
- `ItineraryContext` - Multi-property journey state + stays[] array
- `MobileBookingContext` - Check-in/out dates, guest counts
- localStorage keys: `rol_guest_details`, `rol_itinerary`, `rol_currency`
- New field: `ai_metadata JSONB` for suggestion provenance

### 7. Payment Flow (PayFast Onsite)
- Architecture diagram
- Step-by-step: Initiate → Modal → ITN Callback → PMS Push → Confirmation
- PayFast modal visibility management

### 8. Enchanting PDF System (New Comprehensive Section)
**Document Structure**:
1. **Cover Page**: Hero image + AI-generated welcome line with guest name
2. **Personalized Poem**: 4-line poem generated via Lovable AI (Gemini 2.5 Flash)
3. **Itinerary Timeline**: Visual timeline of all stays
4. **Weather Forecast**: 5-day forecast via Open-Meteo API
5. **AI-Generated Visuals**: 2-3 embedded images (property sunset, local gem)
6. **Personalized Map**: Static Google Maps with property pin + POIs + QR code
7. **Surprise Voucher**: Unique code (e.g., `SAFARI-X7K2`), 25% discount, stored in `experience_vouchers` table
8. **Local Tips**: Curated experiences from `local_experiences` table
9. **Thank You Message**: Tone-matched closing

**Edge Functions**:
- `generate-itinerary-pdf`: Enhanced version with AI personalization
- `send-itinerary-email`: Attaches PDF as base64

### 9. Delight & Surprise Layer (New Section)
- AI surprise injection during booking flow
- PDF voucher generation with Cape Town flair examples:
  - "Complimentary sundowner at the rooftop bar"
  - "25% off Table Mountain cable car tickets"
  - "Private braai experience for two"
- Experience vouchers stored in `experience_vouchers` table

### 10. Database Schema (Updated)
- `bookings` table: Add `surprise_elements JSONB` (poem, voucher_code, map_url, image_urls[])
- `bookings.ai_metadata`: Stores suggestion provenance for analytics
- `itineraries` table: Journey container
- `itinerary_bookings`: Links bookings to journeys
- `experience_vouchers`: Surprise gift codes

### 11. Edge Functions Reference (Updated)
| Function | Description |
|----------|-------------|
| `ai-booking-concierge` | Parses natural language via Lovable API, always performs live PMS adapter calls (never cache), returns structured suggestions + alternatives |
| `generate-itinerary-pdf` | Enhanced version with AI personalization: poem, weather, voucher, map |
| `push-booking` | Verifies availability + creates PMS reservation |
| `multi-push-booking` | Atomic sequential bookings with rollback |
| `payfast-api` | Payment initiation and ITN handling |

### 12. Feature Flags (Updated)
| Flag | Default | Description |
|------|---------|-------------|
| `AI_CONCIERGE_ENABLED` | `true` | Enables AI panel on PropertyShowcase |
| `VOICE_INPUT_ENABLED` | `true` | Enables Web Speech API voice input |
| `ENHANCED_PDF_ENABLED` | `true` | Enables AI-enhanced PDF brochures |

### 13. Error Handling
- `ConciergeErrorBoundary` wraps AI components
- Fallback to legacy flow if AI fails
- `AVAILABILITY_CHANGED` → DateReselectDialog
- PMS push failures → Mark booking as 'failed', display error

### 14. Changelog (Appended)
| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Jan 2026 | Initial complete documentation |
| 1.1 | Jan 2026 | Full inline AI Concierge + Smart Cart flow, voice input, deprecated drawer & separate checkout pages, enchanting personalized PDF with poem, visuals, map + QR voucher |

## Technical Notes

### Files to Reference
- `src/components/booking/AIConciergePanel.tsx` (741 lines)
- `src/components/booking/SmartCart.tsx` (148 lines)
- `src/components/booking/InlineCheckout.tsx` (313 lines)
- `src/components/booking/VoiceInputButton.tsx`
- `supabase/functions/ai-booking-concierge/index.ts` (634 lines)
- `supabase/functions/generate-itinerary-pdf/index.ts` (1554 lines)

### Current Implementation State
The codebase currently has BOTH flows:
- **AI Concierge flow**: Active when `AI_CONCIERGE_ENABLED=true` (AIConciergePanel + SmartCart + InlineCheckout)
- **Legacy flow**: Fallback when flag is false or AI fails (FloatingDateGuestPicker + QuickBookDrawer)

The document will present the AI Concierge as the **PRIMARY** architecture and note the legacy as deprecated fallback only.

## Output Format
The complete markdown file will be output as a single, clean document with:
- Professional formatting
- Consistent heading hierarchy
- ASCII diagrams for flows
- Tables for schemas and references
- No emojis in technical sections (emojis only in user-facing content descriptions)
- Code examples where helpful
