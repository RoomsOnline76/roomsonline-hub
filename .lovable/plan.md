

## Fix: Booking Bar — Slim Strip with Styled Date Pickers and Direct Redirect

### Problem
The booking bar snippet currently:
1. Uses native HTML `<input type="date">` — ugly, inconsistent with the platform's date picker UX
2. Redirects to `/property/{slug}` (full showcase page) instead of `/booking/{slug}` (direct booking flow)
3. The edge function (`generate-integration-assets`) generates an **iframe** version for `booking_bar` that loads the full embed — causing the full property page to render in a tiny strip (what the screenshot shows)

### Solution

#### 1. Update `BookingBarTab.tsx` — Better HTML snippet
- Change redirect URL from `/property/{slug}` to `/booking/{slug}` so guests go straight to the booking page
- Keep pure HTML (no iframe) — the bar is self-contained with date inputs and a Book button
- Improve the native date inputs with better styling (larger touch targets, brand-color accents)
- Add `min` date attributes via inline JS to prevent past-date selection

#### 2. Fix `generate-integration-assets/index.ts` — booking_bar case
The edge function's `booking_bar` case currently generates an **iframe** pointing to the full embed URL. This is what causes the full booking engine to render in a 72px strip. Change it to generate the same pure-HTML bar snippet (date pickers + Book button) that `BookingBarTab.tsx` uses — no iframe.

#### 3. Keep it simple
The booking bar is a **redirect tool**, not an inline engine. It should be:
- A fixed-bottom strip in the property's brand color
- Two date fields (check-in / check-out)
- One "Book Now" button
- Clicking Book opens `/booking/{slug}?checkin=X&checkout=Y` in a new tab

### Files to Modify

| File | Change |
|------|--------|
| `src/components/integrations/BookingBarTab.tsx` | Change `bookingUrl` to use `/booking/` instead of `/property/`; minor styling improvements to snippet |
| `supabase/functions/generate-integration-assets/index.ts` | Replace iframe-based `booking_bar` snippet with pure HTML bar matching BookingBarTab |

