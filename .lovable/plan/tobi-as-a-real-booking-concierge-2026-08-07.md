# TOBI as a real booking concierge

Today the concierge (`AIConciergePanel` + `ai-booking-concierge`) answers questions and can hand back a room suggestion, but it never asks the few things it needs, knows nothing about specials or voucher codes, has no notion of flexible dates, and never confirms a completed proposal. This turns it into a concierge that gathers just enough, acts on the booking form, then checks in.

## Conversation behaviour

TOBI keeps a small slot list and asks only for what is still missing, one short question at a time (never a questionnaire):

1. Who's travelling — how many adults/children.
2. Where — this property, or (in journey/portfolio mode) which destinations, and whether they'd like to combine more than one property.
3. When — dates, plus a single follow-up: "are those dates firm, or flexible by a few days?".

Rules baked into the prompt:
- Never ask for something already known from the booking form, the URL, or earlier in the conversation.
- Ask at most one question per reply; if the guest volunteers everything up front, ask nothing and go straight to the proposal.
- Stay silent until the guest engages (unchanged) — the guided flow only starts once they speak.
- Any answer that partially fills a slot is accepted (e.g. "us two and the kids in December").

## Offers become first-class

The concierge context gets two new inputs:

- **Specials** — active specials for the property (and, in journey mode, for the candidate properties), with their qualifying conditions (min stay, advance-purchase / last-minute lead time, stay-date windows, applicable room types).
- **Vouchers / coupons** — public, currently valid codes available for the stay.

With that, TOBI can:
- Prefer room/date combinations that actually qualify for a special, and say why ("shift to Thursday–Sunday and the 3-night rate unlocks 15% off").
- Use flexible dates to reach a qualifying window instead of quoting rack rate.
- Name an applicable voucher code and apply it, rather than leaving the guest to find it.

## Acting on the booking, then checking in

When TOBI has enough, it returns a structured proposal and the panel applies it immediately to the live booking state — dates, guest counts, selected room(s), and voucher code — exactly as if the guest had filled the form. The existing specials auto-apply and voucher validation on the booking page then run untouched.

Straight after applying, TOBI posts one short recap plus a confirm line:

> Set: Ocean Suite, 12–15 Dec, 2 adults + 1 child, LONGSTAY15 applied — R4 350 total. Happy with this, or shall I change something?

Two inline actions: **Looks good** (scrolls to the checkout step) and **Change something** (returns focus to the chat so the guest can say what to adjust; TOBI re-proposes and re-applies).

## Journey / portfolio mode

In journey mode the same flow runs, and a multi-property proposal adds each leg to the itinerary basket in date order, then recaps all legs in one message before asking for confirmation.

## Technical notes

- `supabase/functions/ai-booking-concierge/index.ts`
  - Extend the request with the known slot state (dates, guests, rooms, destinations) so the model can compute what is missing.
  - Fetch active `property_specials` rows plus valid public voucher codes and feed both into the system prompt with their qualifying rules; add a "flexible dates" flag to the intent parser (`flexible`, `around`, "give or take", "any weekend in…").
  - Return a new `booking_proposal` object alongside `narrative_response`: `{ check_in, check_out, guests, rooms: [{ room_type_id, rate_plan_id? }], voucher_code?, qualifying_special?, legs?: [...] }`, plus `missing_slots` and a single `next_question`.
  - Prompt rules: one question max per reply, no re-asking known slots, no invented specials or codes.
- `src/components/booking/AIConciergePanel.tsx`
  - Track slot state locally and send it with each turn.
  - On `booking_proposal`, apply via the existing `MobileBookingContext` setters / `onRoomSelected` (and `useItinerary.addStay` for journey legs), set the voucher code through a new optional `onVoucherSuggested` prop, then render the recap + Looks good / Change something actions.
- `src/pages/Booking.tsx` — pass the current dates/guests/selected rooms into the panel as known slots and wire `onVoucherSuggested` into the existing voucher state so `validate-voucher` runs as usual.
- `src/components/booking/TobiJourneyAssistant.tsx` — same proposal handling for multi-leg journeys.
- Specials eligibility stays authoritative on the booking page (`resolveSpecialOffers`); TOBI only steers toward qualifying combinations.
- No schema changes; no vendor names in copy, TOBI branding only.
