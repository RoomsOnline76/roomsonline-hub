
# "Add to Your Stay" → Journey Builder with TOBI AI Assistance

## Problem
The "Add to your stay" button currently routes back to the single property page. But the intent is journey-building: the guest may want another room at the same property, a different property entirely (before or after), or TOBI may have already suggested a multi-stop itinerary. The button should route to the portfolio overview so guests can browse all properties, and TOBI should assist with building the journey conversationally.

## Design

### 1) Route "Add to your stay" to the portfolio overview (not the property page)

**In `src/pages/Booking.tsx`** — update the `addRoom` function:
- When in a portfolio embed context (`integration=portfolio_embed`), detect the portfolio slug from the URL params or resolve it from the property's portfolio membership
- Add a new URL param `portfolio_slug` to the checkout flow so it's available
- Route to `/embed/portfolio/{slug}` instead of `/embed/property/{slug}`, carrying forward brand params, existing booking state reference, and date context
- When NOT in a portfolio context (standalone property), keep existing behavior (route back to property page for another room)
- Rename button label contextually: "Add another room" when standalone property, "Extend your journey" when in portfolio context

### 2) Pass booking context to the portfolio page

When navigating back to the portfolio:
- Save current booking state to sessionStorage (already done)
- Pass URL params: `journey_mode=true`, `current_property_id`, `check_in`, `check_out`, brand params
- The portfolio page can then highlight the current booking and suggest "before" or "after" stays

### 3) TOBI Journey Assistant in Checkout

**New component: `src/components/booking/TobiJourneyAssistant.tsx`**
- A small inline panel (not the full chat widget) that appears when the guest clicks "Extend your journey"
- TOBI asks: "Where to next? Before or after your stay? How many nights?"
- Uses the existing `ai-booking-concierge` edge function with a new `mode: 'journey_builder'` that:
  - Fetches the owner's other properties (already has `fetchOwnerAlternatives`)
  - Fetches portfolio sibling properties
  - Suggests properties based on dates (before check-in or after check-out)
- TOBI's suggestions are actionable: clicking one navigates to that property's embed page with dates pre-set

### 4) Enhance `ai-booking-concierge` edge function for journey mode

**In `supabase/functions/ai-booking-concierge/index.ts`**:
- Add `mode?: 'single' | 'journey_builder'` to `ConciergeRequest`
- Add `portfolio_id?: string` and `current_stay?: { property_name, check_in, check_out }` fields
- In journey mode: fetch portfolio properties (not just owner alternatives), check availability for dates before/after the current stay, and return structured `journey_suggestions` with property details
- Update the AI system prompt for journey mode: "Help the guest extend their trip. Suggest properties before or after their current stay at {property_name} ({check_in} to {check_out}). Be enthusiastic about multi-destination journeys."

### 5) Auto-populate from TOBI multi-stop suggestions

**In `src/components/embed/EmbedConciergeChat.tsx`**:
- When TOBI suggests multiple properties/stops in a conversation, structure them as `journey_plan` in the response
- Add a "Book this itinerary" action button when TOBI returns a multi-stop plan
- Clicking it populates the `ItineraryContext` with all stops and navigates to `/journey/review`

**In `src/contexts/ItineraryContext.tsx`**:
- Add `addMultipleStays(stays: ItineraryStay[])` action to batch-add TOBI's suggested itinerary
- Ensure guest details (collected by TOBI in conversation) are forwarded via `setGuestDetails`

### 6) Portfolio page journey awareness

**In `src/pages/EmbedPortfolio.tsx`**:
- Detect `journey_mode=true` param
- Show a banner: "You're staying at {property_name} ({dates}). Add another stop to your journey!"
- Highlight properties available for dates adjacent to the current booking
- Pre-filter or sort properties by geographic proximity or travel route logic

## Files Changed

| File | Change |
|---|---|
| `src/pages/Booking.tsx` | Update `addRoom` to route to portfolio in embed context; add `portfolio_slug` param detection; contextual button label |
| `src/components/booking/TobiJourneyAssistant.tsx` | **New** — inline TOBI panel for journey extension prompts |
| `supabase/functions/ai-booking-concierge/index.ts` | Add `journey_builder` mode; fetch portfolio siblings; return `journey_suggestions`; journey-specific AI prompt |
| `src/components/embed/EmbedConciergeChat.tsx` | Handle multi-stop responses; add "Book this itinerary" action; populate ItineraryContext |
| `src/contexts/ItineraryContext.tsx` | Add `addMultipleStays` batch action |
| `src/pages/EmbedPortfolio.tsx` | Detect journey mode; show current-stay banner; highlight adjacent-date properties |
