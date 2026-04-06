

# Chronological Stay Ordering, Collapsible Billing, and Voucher Input for Journey Checkout

## Problem
1. **No chronological ordering** — stays display in the order they were added, not by check-in date. This affects the checkout page, confirmation email, and journey brochure.
2. **No collapsible billing per property** — the checkout summary shows each property as a flat one-liner with just the total. No way to expand and see the breakdown (room charges, extras, specials, discounts).
3. **No voucher input** — the single-property checkout (`Booking.tsx`) has full voucher/promo-code support via `FluentGuestForm`, but the multi-stay `JourneyCheckout.tsx` has zero voucher functionality.

## What will be done

### 1. Sort stays chronologically everywhere
Add a utility sort `stays.sort((a, b) => a.dates.check_in.localeCompare(b.dates.check_in))` in:
- **`JourneyCheckout.tsx`** — sort before rendering the summary and timeline
- **`JourneyReview.tsx`** — sort before rendering stay cards
- **`generate-itinerary-pdf/index.ts`** — sort stays before building the brochure HTML
- **`send-itinerary-email/index.ts`** — sort stays before building the email body (if it renders stays independently of the brochure)

A shared `sortStaysChronologically` helper keeps it DRY on the frontend.

### 2. Collapsible property billing in checkout summary
Replace the flat stay list in `JourneyCheckout.tsx`'s right-column summary card with a collapsible accordion per property:
- **Collapsed (default)**: property name, dates, total price, expand chevron
- **Expanded**: shows `price_breakdown` detail — subtotal (rooms × nights), each fee line, each tax line, specials/discounts if any, stay total
- Uses the existing `Collapsible`/`CollapsibleTrigger`/`CollapsibleContent` from `@/components/ui/collapsible`

### 3. Voucher code input in checkout
Add a voucher input field in the checkout form area (left column, below Special Requests):
- Text input + "Apply" button, same UX pattern as `FluentGuestForm`
- On apply: call the existing `validate-promo-code` edge function with the code and the property IDs from the itinerary
- Show valid/invalid state with green/red border
- If valid: display discount amount, subtract from grand total
- Store applied voucher in itinerary context so it persists and gets saved to DB
- The voucher field sits in the left form column, clearly visible — not hidden inside a collapsible

### Answer to "how would the user capture a voucher code?"
With this change, a dedicated "Voucher / Promo Code" input with an "Apply" button will appear below the Special Requests card on the checkout page. The user types the code, clicks Apply, and sees immediate validation feedback. The discount is reflected in the grand total.

## Files to change

| File | Change |
|---|---|
| `src/lib/journeyUtils.ts` | New — export `sortStaysChronologically()` helper |
| `src/pages/JourneyCheckout.tsx` | Sort stays; replace flat summary with collapsible per-property billing; add voucher input card with apply logic |
| `src/pages/JourneyReview.tsx` | Sort stays before rendering |
| `src/contexts/ItineraryContext.tsx` | Add `appliedVoucher` state + setter to context so discount persists |
| `supabase/functions/generate-itinerary-pdf/index.ts` | Sort stays by check_in before building brochure |
| `supabase/functions/send-itinerary-email/index.ts` | Sort stays by check_in before building email (if applicable) |

## Technical detail

**Sorting** — simple string compare on ISO date `check_in`:
```typescript
export const sortStaysChronologically = (stays: ItineraryStay[]) =>
  [...stays].sort((a, b) => a.dates.check_in.localeCompare(b.dates.check_in));
```

**Collapsible billing** — uses existing Radix `Collapsible` primitive:
```text
┌─────────────────────────────────────────┐
│ ① Property Name           R 4,500  ▼   │  ← collapsed
├─────────────────────────────────────────┤
│   11 Apr – 14 Apr · 3 nights           │
│   ─────────────────────────────         │
│   Dungeon Room × 3 nights    R 3,600   │  ← expanded
│   Cleaning Fee               R   350   │
│   Tourism Levy               R   150   │
│   Special: -10% early bird  -R   400   │
│   Stay Total                 R 3,700   │
└─────────────────────────────────────────┘
```

**Voucher** — reuses existing `validate-promo-code` edge function. Applied discount stored in context and deducted from `totalPrice` in the grand total display and payment amount.

