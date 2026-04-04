

# AI Travel Concierge — Audit & Enhancement Plan

## Current State (What Already Exists)

The system already has a robust AI concierge with:
- **NLP intent parsing**: Dates, guest counts, nights, preferences (romantic, pool, etc.)
- **Live PMS availability**: Fetches from Hostfully, Benson, HotelBeds, or cache
- **AI narrative generation**: TOBI personality via xAI (Grok) with Lovable AI fallback
- **Premium-first upsell**: Recommends most expensive room first, value option second
- **Cross-sell**: Checks owner's other properties when unavailable
- **Surprise & Delight**: Tiered gifting based on booking value
- **Voice input**: Speech-to-text for queries
- **Date/guest pickers**: Manual selection alongside natural language
- **Proactive prompts**: 8-second idle trigger

## Gaps vs. Reference Capability

The reference says: *"Tell me what you're looking for — dates, number of guests, bedroom size, or budget — and I'll find the right apartment for you."*

| Capability | Status | Gap |
|---|---|---|
| Date parsing | Done | -- |
| Guest count | Done | -- |
| Bedroom size/type | Partial | NLP doesn't parse "2 bedroom" or "studio" — only picks up preference keywords |
| Budget filtering | Missing | "budget" is treated as a preference keyword, not a numeric filter. "Under R2000/night" is ignored |
| Welcome greeting | Missing | No initial message — empty chat until user types or 8s proactive prompt fires |
| Conversation memory | Missing | No multi-turn context — each query is standalone, previous messages not sent to AI |
| Embed page integration | Missing | `EmbedProperty.tsx` has no concierge at all — only PropertyShowcase has it |
| Quick suggestion chips | Missing | No tap-to-ask suggestions like "Show me cheapest" or "Pet-friendly options" |

## Plan

### 1. Add Welcome Greeting Message (AIConciergePanel.tsx)
- On mount (when `isInitiated` becomes true or on desktop expand), inject an initial assistant message:
  *"Hi! I'm TOBI, your AI travel concierge. Tell me your dates, number of guests, room preference, or budget — and I'll find the perfect stay for you."*
- Add 3-4 quick-reply suggestion chips below the welcome message: "This weekend for 2", "Show me the best room", "Family-friendly options", "Under R1500/night"
- Clicking a chip auto-submits that query

### 2. Add Budget Parsing to NLP (edge function)
- Parse patterns like "under R2000", "budget R1000-R1500", "max R3000/night", "less than $150"
- Add `budget?: { max?: number; min?: number; currency?: string }` to `ParsedIntent`
- In main handler, filter `suggestions` to only include rooms within budget range
- Pass budget context to AI narrative so TOBI can acknowledge the constraint

### 3. Add Bedroom Size/Type Parsing (edge function)
- Parse "1 bedroom", "2-bed", "studio", "suite", "penthouse", "family room"
- Add `room_preference?: string` to `ParsedIntent`
- Match against room type names when filtering suggestions
- Pass to AI narrative for context-aware responses

### 4. Add Conversation Memory (both files)
- **Frontend**: Send full `messages` array (last 10) to the edge function as `conversation_history`
- **Edge function**: Include conversation history in the AI prompt so TOBI remembers what was discussed ("I mentioned the sea-view room earlier — want me to check dates for that one?")

### 5. Add Quick Suggestion Chips (AIConciergePanel.tsx)
- Render below assistant messages as tappable pills
- Dynamic based on context: if no dates yet → date suggestions; if dates set → room/budget suggestions
- Chips: "This weekend", "Next month", "Show cheapest", "Pet-friendly", "Family room"

### 6. Add Concierge to Embed Property Page (EmbedProperty.tsx)
- Import and render `AIConciergePanel` on embed pages (guarded by `ai_concierge_enabled` flag)
- Pass the same props as PropertyShowcase: propertyId, roomTypes, availabilityMap

## Files to Change

| File | Changes |
|---|---|
| `supabase/functions/ai-booking-concierge/index.ts` | Add budget parsing, bedroom size parsing, conversation history in prompt |
| `src/components/booking/AIConciergePanel.tsx` | Add welcome greeting, quick-reply chips, send conversation history |
| `src/pages/EmbedProperty.tsx` | Add AIConciergePanel integration |

