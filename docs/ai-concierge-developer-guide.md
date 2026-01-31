# AI Concierge Developer Guide

**Version**: 1.0.0  
**Created**: 2026-01-31  
**Status**: Production Ready

---

## Overview

The AI Concierge is a conversational booking interface that transforms the traditional date-picker → room-selection → checkout flow into a natural language experience. Guests can simply say "4 nights for 2 adults in March" and receive availability-verified suggestions.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PropertyShowcase                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │  AIConciergePanel │  │     SmartCart    │  │ InlineCheckout │ │
│  │  (Sidebar/Sheet) │  │  (Sticky Bar)    │  │  (Accordion)   │ │
│  └────────┬─────────┘  └────────┬─────────┘  └───────┬────────┘ │
│           │                     │                     │          │
│           ▼                     ▼                     ▼          │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    ItineraryContext                         │ │
│  │  (stays[], guestDetails, totalPrice, specialRequests)      │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │   ai-booking-concierge        │
              │   (Edge Function)             │
              │   - NLP date/guest parsing    │
              │   - Live PMS availability     │
              │   - Smart suggestions         │
              └───────────────┬───────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        ┌──────────┐   ┌──────────┐   ┌──────────┐
        │  Benson  │   │ Hostfully│   │ HotelBeds│
        │   API    │   │   API    │   │   API    │
        └──────────┘   └──────────┘   └──────────┘
```

---

## Feature Flag

The AI Concierge is controlled by the `AI_CONCIERGE_ENABLED` feature flag:

```typescript
// src/hooks/useFeatureFlags.tsx
export function useAIConciergeEnabled() {
  const { data, isLoading } = useFeatureFlags();
  return { enabled: data?.ai_concierge_enabled ?? false, isLoading };
}
```

**To enable**: Set `AI_CONCIERGE_ENABLED=true` in the `api_keys` table.

---

## Components

### AIConciergePanel

**Location**: `src/components/booking/AIConciergePanel.tsx`

**Purpose**: Main conversational interface with message bubbles and suggestion cards.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `propertyId` | `string` | Property UUID |
| `propertyName` | `string` | Display name |
| `propertySlug` | `string` | URL slug for navigation |
| `propertyImage` | `string?` | Hero image for itinerary |
| `externalSystem` | `string?` | PMS type (benson, hostfully, etc.) |
| `roomTypes` | `RoomType[]` | Available room types |
| `availabilityMap` | `Map?` | Calendar availability data |
| `onRoomSelected` | `function?` | Callback when room is added |
| `onError` | `function?` | Callback to trigger fallback |

**Behavior**:
- Desktop: Right-side fixed panel (w-80)
- Mobile: Collapsible bottom sheet
- Proactive prompt after 8 seconds idle
- Voice input via Web Speech API

### SmartCart

**Location**: `src/components/booking/SmartCart.tsx`

**Purpose**: Sticky summary bar showing cart contents and checkout trigger.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `onCheckout` | `function` | Opens InlineCheckout |
| `onClear` | `function?` | Clears cart |

**Behavior**:
- Only renders when `hasStays` is true
- Expands to show stay breakdown
- Shows total nights, guests, price

### InlineCheckout

**Location**: `src/components/booking/InlineCheckout.tsx`

**Purpose**: Full-screen overlay with guest details and payment.

**Props**:
| Prop | Type | Description |
|------|------|-------------|
| `open` | `boolean` | Controls visibility |
| `onClose` | `function` | Close handler |
| `onPaymentSuccess` | `function` | Called after successful payment |
| `onPaymentCancelled` | `function?` | Called if payment cancelled |

**Flow**:
1. Validate guest details (name, email, phone)
2. Save itinerary to database
3. Initiate PayFast payment
4. Show PayFast modal
5. Handle ITN callback → booking creation

---

## Edge Function: ai-booking-concierge

**Location**: `supabase/functions/ai-booking-concierge/index.ts`

### Request Schema

```typescript
interface ConciergeRequest {
  property_id: string;
  user_query: string;
  current_dates?: {
    check_in: string;  // YYYY-MM-DD
    check_out: string; // YYYY-MM-DD
  };
  current_guests?: {
    adults: number;
    children: number;
    infants: number;
  };
  room_types?: Array<{
    id: string;
    name: string;
    max_guests: number;
  }>;
  session_id?: string;
}
```

### Response Schema

```typescript
interface ConciergeResponse {
  suggestions: ConciergeSuggestion[];
  narrative_response: string;
  surprise_gift?: {
    type: 'voucher' | 'upgrade' | 'amenity';
    code?: string;
    description: string;
  };
  proactive_tip?: string;
}

interface ConciergeSuggestion {
  id: string;
  type: 'dates' | 'room' | 'upsell' | 'date_alternative';
  dates?: { check_in: string; check_out: string };
  room?: { id: string; name: string; price_per_night: number; total: number };
  message: string;
  savings?: number;
  is_best_value?: boolean;
}
```

### NLP Parsing

The function uses simple pattern matching for common queries:

| Pattern | Extracted |
|---------|-----------|
| `"4 nights"` | `nights: 4` |
| `"2 adults 1 child"` | `guests: { adults: 2, children: 1 }` |
| `"in March"` | `month: 3` |
| `"next weekend"` | Calculated dates |
| `"weekday"` | Mon-Thu preference |

### PMS Integration

Live availability is fetched based on `property.external_system`:

| System | Adapter | Availability Method |
|--------|---------|---------------------|
| benson | `benson-api` | `action: fetch_availability` |
| hostfully | `hostfully-api` | `action: rates` |
| hotelbeds | `hotelbeds-api` | `action: availability` |
| none/null | `property_rates` table | Direct query |

**RULE #1**: All suggestions MUST be verified against live PMS data.

---

## State Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│    idle     │────▶│  listening  │────▶│  thinking   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
                    ┌─────────────────────────┘
                    ▼
              ┌─────────────┐     ┌─────────────┐
              │  suggesting │────▶│ cart_ready  │
              └─────────────┘     └─────────────┘
                                        │
                    ┌───────────────────┘
                    ▼
              ┌─────────────┐     ┌─────────────┐
              │checkout_open│────▶│  validating │
              └─────────────┘     └─────────────┘
                                        │
                    ┌───────────────────┘
                    ▼
              ┌─────────────┐     ┌─────────────┐
              │payment_active────▶│  confirmed  │
              └─────────────┘     └─────────────┘
```

---

## Error Handling

### Graceful Fallback

When AI fails, the system falls back to legacy `FloatingDateGuestPicker`:

```typescript
// In PropertyShowcase.tsx
const [aiFailed, setAiFailed] = useState(false);

const handleAIError = useCallback(() => {
  setAiFailed(true);
  toast.info("Switching to manual booking...");
}, []);

// Render:
{aiConciergeEnabled && !aiFailed ? (
  <AIConciergePanel onError={handleAIError} ... />
) : (
  <FloatingDateGuestPicker ... />
)}
```

### Error Messages

| Error Type | User Message |
|------------|--------------|
| Network | "I'm having trouble connecting. Let me try again..." |
| Rate limit | "I need a moment to catch my breath. Please try again shortly." |
| PMS unavailable | Falls back to calendar selection |
| Parse failure | "I didn't quite catch that. Try: '3 nights for 2 adults in March'" |

---

## Voice Input

**Location**: `src/hooks/useSpeechRecognition.ts`

Uses Web Speech API (`webkitSpeechRecognition` / `SpeechRecognition`):

```typescript
const { isListening, transcript, startListening, isSupported } = useSpeechRecognition();
```

**Browser Support**:
- Chrome, Edge: Full support
- Safari: Partial support
- Firefox: Not supported (fallback to text input)

---

## Enchanting PDF Brochure

**Location**: `supabase/functions/generate-itinerary-pdf/index.ts`

### Features

1. **AI Poem**: Personalized 4-line poem via Lovable AI
2. **Weather Forecast**: 5-day forecast via Open-Meteo API
3. **Surprise Voucher**: 25% discount code stored in `experience_vouchers`

### Poem Generation

```typescript
const poemPrompt = `Write a 4-line rhyming poem for ${guestName} 
visiting ${propertyNames.join(' and ')}. 
Tone: ${journeyTone}. 
Make it warm, personal, and memorable.`;
```

### Voucher System

```sql
-- Table: experience_vouchers
id uuid PRIMARY KEY
itinerary_id uuid REFERENCES itineraries(id)
code text UNIQUE  -- e.g., "SUNSET-A7K2"
discount_percent int DEFAULT 25
valid_until timestamptz
redeemed_at timestamptz
```

---

## Testing

### Manual Testing

1. Enable feature flag: `AI_CONCIERGE_ENABLED=true`
2. Navigate to any property page
3. Try queries:
   - "4 nights for 2 adults in March"
   - "Weekend getaway for a couple"
   - "Next week, family of 4"

### Edge Function Testing

```bash
# Via curl
curl -X POST \
  'https://qmprswbgkpzcvexmmcbf.supabase.co/functions/v1/ai-booking-concierge' \
  -H 'Content-Type: application/json' \
  -d '{
    "property_id": "test-uuid",
    "user_query": "3 nights for 2 adults"
  }'
```

---

## Metrics

| Metric | Target |
|--------|--------|
| Clicks to checkout | ≤ 3 |
| Time to first intent | < 30 seconds |
| AI suggestion acceptance | > 60% |
| Voice input usage (mobile) | > 15% |
| PDF open rate | > 80% |

---

## Files Reference

| File | Purpose |
|------|---------|
| `src/components/booking/AIConciergePanel.tsx` | Main concierge UI |
| `src/components/booking/SmartCart.tsx` | Cart summary bar |
| `src/components/booking/InlineCheckout.tsx` | Checkout form |
| `src/components/booking/VoiceInputButton.tsx` | Voice trigger |
| `src/components/booking/ConciergeSkeleton.tsx` | Loading states |
| `src/components/booking/ConciergeErrorBoundary.tsx` | Error handling |
| `src/hooks/useSpeechRecognition.ts` | Speech API hook |
| `src/hooks/useFeatureFlags.tsx` | Feature flag hook |
| `supabase/functions/ai-booking-concierge/index.ts` | AI brain |
| `supabase/functions/generate-itinerary-pdf/index.ts` | PDF generation |

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-31 | Initial release with full 4-phase implementation |

---

*This guide is maintained by the RoomsOnline development team.*
