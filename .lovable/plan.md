

# Plan: AI Concierge Booking Experience – Complete 4-Phase Implementation

## Executive Summary

Transform the RoomsOnline booking flow from a multi-widget, navigation-heavy experience into a magical AI-powered concierge system. This plan covers all four phases: Core UI, AI Intelligence, Enchanting PDF, and Production Polish.

---

## Current Architecture Analysis

### Existing Components
| Component | Location | Purpose |
|-----------|----------|---------|
| `FloatingDateGuestPicker` | `src/components/booking/` | Bottom pill for date/guest selection |
| `QuickBookDrawer` | `src/components/booking/` | Slide-up room selection & pricing |
| `JourneyBuilder` | `src/components/journey/` | Floating mini panel for journey |
| `JourneyCheckout` | `src/pages/` | Separate checkout page |
| `MobileBookingContext` | `src/contexts/` | Session state for booking |
| `ItineraryContext` | `src/contexts/` | Multi-property journey state |
| `PayFastOnsiteModal` | `src/components/booking/` | Payment modal |

### Key PMS Integration Points (Must Preserve)
- Live availability via `validate-itinerary-availability`
- Booking creation via `multi-push-booking`
- PayFast payment-first flow via `payfast-api`
- Support: Benson, Hostfully, HotelBeds, NightsBridge, Manual properties

---

## Phase 1: Core UI Transformation

### Goal
Replace FloatingDateGuestPicker + QuickBookDrawer + separate checkout with:
- AI Concierge Panel (sidebar/bottom sheet)
- Smart Cart (sticky summary bar)
- Inline Checkout (accordion, no navigation)

### New Components

#### 1. `src/components/booking/AIConciergePanel.tsx`

```text
Desktop: Right sidebar (w-80)
Mobile: Bottom sheet (collapsible)

┌─────────────────────────────────────┐
│ 🌿 Your Personal Travel Concierge  │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ "Book 4 nights for 2 adults    │🎤│
│ │  + 1 child in March..."        │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ AI Message Bubble ─────────────┐ │
│ │ 💬 "I found 3 great options..." │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Suggestion Cards ──────────────┐ │
│ │ 📅 Mar 15-19 · R2,650/night    │ │
│ │ ✨ Best value! Save R500       │ │
│ │ [Select]                       │ │
│ └─────────────────────────────────┘ │
│                                     │
│ ┌─ Manual Override ───────────────┐ │
│ │ 📅 Select dates  │ 👥 Guests   │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Features:**
- Natural language input with placeholder examples
- Voice input button (Web Speech API with fallback)
- Initially collapsed on mobile, slides up on first interaction
- Message bubble UI for AI responses
- Selectable suggestion cards with pricing
- Manual date/guest pickers as fallback
- Proactive message after 8 seconds: "Need help choosing?"

#### 2. `src/components/booking/SmartCart.tsx`

```text
Sticky bar at bottom of PropertyShowcase

┌───────────────────────────────────────────────────────────────┐
│ 🛏️ Ocean Suite · 4 nights · 2+1 guests │ R10,600 │ [Checkout]│
│   ▲ Expand for details                                       │
└───────────────────────────────────────────────────────────────┘
```

**Features:**
- Shows selected room, nights, guests, total price
- Expands on tap to show breakdown
- Real-time price updates from ItineraryContext
- "Checkout" button triggers InlineCheckout accordion
- Synced with ItineraryContext stays

#### 3. `src/components/booking/InlineCheckout.tsx`

```text
Accordion that expands FROM SmartCart (no page navigation)

┌─ Guest Details ─────────────────────┐
│ Name: [__________________________ ] │
│ Email: [_________________________ ] │
│ Phone: [_________________________ ] │
└─────────────────────────────────────┘
┌─ Special Requests ──────────────────┐
│ [Any dietary requirements...      ] │
└─────────────────────────────────────┘
┌─ Payment ───────────────────────────┐
│ Grand Total: R10,600                │
│ [💳 Pay Now with PayFast]           │
│ 🔒 Secured by PayFast · SSL        │
└─────────────────────────────────────┘
```

**Features:**
- Slides up from SmartCart when "Checkout" clicked
- Guest details form with validation (name, email, phone)
- Special requests textarea
- Booking summary with price breakdown
- PayFast button integrates with existing PayFastOnsiteModal
- All on same page – zero navigation to /journey/checkout

### Files to Create

| File | Purpose |
|------|---------|
| `src/components/booking/AIConciergePanel.tsx` | Main AI input + suggestions UI |
| `src/components/booking/SmartCart.tsx` | Sticky booking summary bar |
| `src/components/booking/InlineCheckout.tsx` | Embedded checkout accordion |
| `src/components/booking/VoiceInputButton.tsx` | Web Speech API wrapper |
| `src/hooks/useSpeechRecognition.ts` | Speech recognition hook |

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Replace FloatingDateGuestPicker with AIConciergePanel + SmartCart |
| `src/contexts/MobileBookingContext.tsx` | Add AI suggestions state, concierge messages |
| `src/contexts/ItineraryContext.tsx` | Add concierge interaction tracking |
| `src/hooks/useFeatureFlags.tsx` | Add `ai_concierge_enabled` flag |
| `supabase/functions/get-feature-flags/index.ts` | Whitelist AI_CONCIERGE_ENABLED |

### Feature Flag Implementation

```typescript
// In FeatureFlags interface
ai_concierge_enabled: boolean;

// In DEFAULT_FLAGS
ai_concierge_enabled: false,

// In get-feature-flags edge function
const ALLOWED_FEATURE_FLAGS = [
  // ... existing
  'AI_CONCIERGE_ENABLED',
];
```

### PropertyShowcase Integration Logic

```typescript
// In PropertyShowcase.tsx
const { data: flags } = useFeatureFlags();
const aiConciergeEnabled = flags?.ai_concierge_enabled ?? false;

// Render:
{aiConciergeEnabled ? (
  <>
    <AIConciergePanel
      propertyId={property.id}
      propertyName={property.name}
      roomTypes={roomTypes}
      availability={calendarAvailability}
      onRoomSelected={handleRoomSelection}
    />
    <SmartCart />
    <InlineCheckout
      onPaymentSuccess={handlePaymentSuccess}
      onPaymentCancelled={handlePaymentCancelled}
    />
  </>
) : (
  <>
    {/* Legacy flow - keep as fallback */}
    <FloatingDateGuestPicker
      onContinue={() => setQuickBookDrawerOpen(true)}
      ctaLabel="Check Rates"
      availabilityMap={calendarAvailability}
    />
    <QuickBookDrawer {...existingProps} />
  </>
)}
```

---

## Phase 2: AI Concierge Intelligence Layer

### New Edge Function: `supabase/functions/ai-booking-concierge/index.ts`

```typescript
// Request structure
interface ConciergeRequest {
  property_id: string;
  user_query: string;
  current_dates?: { check_in: string; check_out: string };
  current_guests?: { adults: number; children: number; infants: number };
  session_id?: string;  // For surprise gift tracking
}

// Response structure
interface ConciergeResponse {
  suggestions: {
    type: 'dates' | 'room' | 'upsell' | 'date_alternative';
    dates?: { check_in: string; check_out: string };
    room?: { id: string; name: string; price_per_night: number; total: number };
    message: string;
    savings?: number;
    is_best_value?: boolean;
  }[];
  narrative_response: string;  // Conversational reply from "Carike"
  surprise_gift?: {
    type: 'voucher' | 'upgrade' | 'amenity';
    code?: string;
    description: string;
  };
  proactive_tip?: string;  // Optional tip about the property
}
```

### Intelligence Features

1. **Natural Language Date Parsing**
   - "4 nights in March" → Find best 4-night slots in March
   - "Weekend getaway" → Friday-Sunday options
   - "Avoid school holidays" → Filter peak periods
   - "Next week for 2 adults and a child" → Parse guests + relative dates

2. **Live PMS Availability (RULE #1)**
   - ALWAYS fetch live availability from PMS (no stale cache for booking decisions)
   - Route to correct adapter based on `external_system`
   - Return availability-verified suggestions only

3. **Smart Suggestions**
   - Cheaper date alternatives: "Save R500 by arriving Wednesday"
   - Room upsells: "Upgrade to Ocean View for +R450/night"
   - Stay extensions: "Add an extra night for just R1,800"
   - Value indicators on suggestions

4. **Surprise & Delight (1x per session)**
   - 10% random chance to offer surprise
   - "I've arranged a complimentary bottle of wine"
   - Track in session to prevent multiple offers

### Proactive Messaging

After 8 seconds idle on PropertyShowcase:
```
"Need help choosing dates? Tell me your ideal trip and I'll find the best options."
```

### Files to Create

| File | Purpose |
|------|---------|
| `supabase/functions/ai-booking-concierge/index.ts` | AI brain for natural language booking |

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/config.toml` | Add ai-booking-concierge function config |
| `src/components/booking/AIConciergePanel.tsx` | Connect to edge function, display suggestions |

---

## Phase 3: Enchanting PDF Brochure

### Enhancements to Confirmation PDF

The existing `generate-itinerary-pdf` already has good structure. Enhance with:

#### 1. AI-Generated Personal Poem/Story

```typescript
// Call Lovable AI for personalized 4-line poem
const poemPrompt = `Create a 4-line poem for a guest named ${guestName} 
visiting ${propertyNames.join(' and ')}. 
Tone: ${detectedTone}. 
Make it warm, personal, and memorable.`;

// Example output:
"Where mountains meet the morning light,
Two hearts find peace from day to night.
At Latter Days, your story grows—
A love that only Africa knows."
```

#### 2. Personalized Cover Hero

- Property hero image with gradient overlay
- "Welcome, [GuestName]!" in elegant typography
- Journey dates and destination count
- Tone-appropriate subtitle

#### 3. Weather Forecast

```typescript
// Fetch weather for travel dates
const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=temperature_2m_max,temperature_2m_min,weathercode&start_date=${checkIn}&end_date=${checkOut}`;
```

#### 4. Surprise Voucher System

```sql
-- New table for experience vouchers
CREATE TABLE experience_vouchers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  itinerary_id uuid REFERENCES itineraries(id),
  code text UNIQUE NOT NULL,
  discount_percent int DEFAULT 25,
  description text,
  valid_until timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE experience_vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read own vouchers" ON experience_vouchers
  FOR SELECT USING (
    itinerary_id IN (
      SELECT id FROM itineraries WHERE guest_email = current_setting('request.jwt.claims', true)::json->>'email'
    )
  );
```

Generate unique voucher code like `SUNSET-[random4]` for local experience discount.

### Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/generate-itinerary-pdf/index.ts` | Add poem, weather, voucher generation |
| `supabase/functions/send-itinerary-email/index.ts` | Ensure PDF attachment works |

### Database Migration

- Create `experience_vouchers` table for tracking surprise gifts

---

## Phase 4: Polish & Production Readiness

### Voice Input Implementation

```typescript
// src/hooks/useSpeechRecognition.ts
export function useSpeechRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported('webkitSpeechRecognition' in window || 'SpeechRecognition' in window);
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported) return;
    
    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join('');
      setTranscript(transcript);
    };
    
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }, [isSupported]);

  return { isListening, transcript, startListening, isSupported };
}
```

### Graceful Fallback Logic

```typescript
// In PropertyShowcase.tsx
const { data: flags, isLoading: flagsLoading } = useFeatureFlags();
const aiConciergeEnabled = flags?.ai_concierge_enabled ?? false;

// If AI fails, fall back to legacy
const [aiFailed, setAiFailed] = useState(false);

const handleAIError = () => {
  setAiFailed(true);
  toast.info("Switching to manual booking...");
};

// Render:
{aiConciergeEnabled && !aiFailed ? (
  <AIConciergePanel onError={handleAIError} ... />
) : (
  <FloatingDateGuestPicker ... />
)}
```

### Loading States

| Component | Loading State |
|-----------|---------------|
| AIConciergePanel | Skeleton placeholder for suggestions |
| AI Response | Animated typing indicator |
| SmartCart | Price calculation shimmer |
| InlineCheckout | Form skeleton |

### Error States

| Error | User Message |
|-------|--------------|
| Network error | "I'm having trouble connecting. Let me try again..." |
| Rate limit | "I need a moment to catch my breath. Please try again shortly." |
| PMS unavailable | Falls back to calendar-based selection |
| AI parse failure | "I didn't quite catch that. Try: '3 nights for 2 adults in March'" |

### JourneyConfirmation Enhancement

Update confirmation page to highlight the PDF:
```
🎁 Your Magical Itinerary
We've created a beautiful travel document just for you.
[Download PDF] [Share Journey]
```

### State Machine Update

Update `docs/system-export/booking-flow-state-machine.json`:

```json
{
  "ai_concierge_flow": {
    "states": [
      "idle",
      "listening",
      "thinking", 
      "suggesting",
      "cart_ready",
      "checkout_open",
      "validating",
      "payment_active",
      "confirmed"
    ],
    "transitions": {
      "idle → listening": "user_speaks OR user_types",
      "listening → thinking": "query_submitted",
      "thinking → suggesting": "ai_response_received",
      "suggesting → cart_ready": "suggestion_selected",
      "cart_ready → checkout_open": "checkout_button_clicked",
      "checkout_open → validating": "pay_button_clicked",
      "validating → payment_active": "availability_confirmed",
      "payment_active → confirmed": "payfast_callback_success"
    },
    "fallback": "On any AI error → revert to legacy FloatingDateGuestPicker flow"
  }
}
```

---

## Technical Implementation Order

### Week 1: Phase 1 Foundation
1. ✅ Create feature flag infrastructure (`AI_CONCIERGE_ENABLED`)
2. Build AIConciergePanel shell (UI only, no AI backend)
3. Build SmartCart component with ItineraryContext sync
4. Build InlineCheckout with PayFast integration
5. Wire all components together on PropertyShowcase
6. Test full flow with manual date/guest selection

### Week 2: Phase 2 Intelligence
1. Create `ai-booking-concierge` edge function
2. Implement NLP date/guest parsing with Lovable AI
3. Connect to PMS adapters for live availability
4. Build suggestion card UI in AIConciergePanel
5. Add proactive messaging (8-second idle prompt)
6. Test end-to-end with AI suggestions

### Week 3: Phase 3 PDF Enhancement
1. Add AI poem/story generation to PDF
2. Integrate weather forecast API
3. Create experience_vouchers table
4. Generate surprise voucher codes
5. Update PDF styling for luxury feel
6. Test email delivery with attachments

### Week 4: Phase 4 Polish
1. Implement voice input with Web Speech API
2. Add all loading skeletons and error states
3. Comprehensive cross-PMS testing (Benson, Hostfully, NightsBridge, Manual)
4. Update booking-flow-state-machine.json
5. Update developer documentation
6. Feature flag rollout strategy

---

## Files Summary

### New Files (8)
| File | Purpose |
|------|---------|
| `src/components/booking/AIConciergePanel.tsx` | Main AI concierge UI |
| `src/components/booking/SmartCart.tsx` | Sticky cart summary |
| `src/components/booking/InlineCheckout.tsx` | Embedded checkout form |
| `src/components/booking/VoiceInputButton.tsx` | Voice input trigger |
| `src/hooks/useSpeechRecognition.ts` | Speech recognition hook |
| `supabase/functions/ai-booking-concierge/index.ts` | AI intelligence layer |
| Database migration | `experience_vouchers` table |
| `docs/ai-concierge-developer-guide.md` | Developer documentation |

### Modified Files (12)
| File | Changes |
|------|---------|
| `src/pages/PropertyShowcase.tsx` | Integrate concierge components |
| `src/contexts/MobileBookingContext.tsx` | Add AI state management |
| `src/contexts/ItineraryContext.tsx` | Add concierge tracking |
| `src/hooks/useFeatureFlags.tsx` | Add ai_concierge_enabled |
| `supabase/functions/get-feature-flags/index.ts` | Whitelist new flag |
| `supabase/functions/generate-itinerary-pdf/index.ts` | Add poem, weather, voucher |
| `supabase/functions/send-itinerary-email/index.ts` | Verify PDF attachment |
| `supabase/config.toml` | Add ai-booking-concierge |
| `src/pages/JourneyConfirmation.tsx` | Highlight PDF download |
| `docs/booking-flow-developer-guide.md` | Update documentation |
| `docs/system-export/booking-flow-state-machine.json` | Add AI flow states |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| AI service outage | Feature flag + graceful fallback to legacy flow |
| Voice input not supported | Text input always available as primary |
| PMS integration failures | Same error handling as current QuickBookDrawer |
| Payment failures | Existing PayFastOnsiteModal error handling |
| Session state loss | ItineraryContext already persists to sessionStorage |
| Rate limiting | Lovable AI handles gracefully; show friendly message |

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Clicks to checkout | ≤ 3 (from 6+) |
| Time to first booking intent | < 30 seconds |
| AI suggestion acceptance rate | > 60% |
| Voice input usage | > 15% of mobile users |
| PDF open rate | > 80% |
| Surprise gift redemption | > 20% |

