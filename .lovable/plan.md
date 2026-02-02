

# Fix Critical Journey Booking Issues

## Summary of Issues Found

Based on investigation, there are **6 critical issues** with the Journey booking flow:

| Issue | Root Cause | Impact |
|-------|------------|--------|
| 1. PayFast payment skipped | `JourneyCheckout.tsx` bypasses PayFast entirely - calls `multi-push-booking` directly | Bookings confirmed without payment |
| 2. PDF downloads as blank | HTML generated but `html2pdf.js` produces blank PDF (known library issue) | Guest receives unusable brochure |
| 3. Brochure attached as HTML | `send-itinerary-email` attaches `.html` file instead of PDF | Confusing file format for guests |
| 4. Email shows "undefined" property | Stays data uses `property_id` but email expects `propertyId` | Broken email content |
| 5. "Invalid Date" in email | Stays use `dates.check_in` but email expects `checkIn` | Broken date display |
| 6. Duplicate reservation email | `push-booking` sends guest email; `multi-push-booking` sends itinerary email | Guest gets 2 emails |
| 7. Promotional text to remove | "We've created a beautiful travel document..." text | Per user request |

## Technical Root Causes

### Issue 1: PayFast Skipped
`JourneyCheckout.tsx` line 166-170:
```typescript
// Step 4: Call multi-push-booking  ← WRONG: No payment first!
const { data: bookingResult, error: bookingError } = await supabase.functions.invoke('multi-push-booking', {
  body: { itinerary_id: itineraryId }
});
```

The flow should be: `JourneyCheckout → PayFast → ITN callback → multi-push-booking`

### Issue 2-3: PDF/HTML Generation
`send-itinerary-email` lines 337-343:
```typescript
attachments.push({
  filename: `Journey-Brochure-${...}.html`,  // ← Not a PDF!
  content: base64Content,
  content_type: "text/html",  // ← HTML attachment!
});
```

And `JourneyConfirmation.tsx` uses `html2pdf.js` which requires DOM rendering and is unreliable.

### Issue 4-5: Data Field Mismatch
Itinerary `stays` array stores snake_case fields:
```json
{
  "property_id": "ea9a019d-...",
  "property_name": "[SANDBOX] xxxLatter Days",
  "dates": { "check_in": "2026-02-24", "check_out": "2026-02-26" }
}
```

But `send-itinerary-email` expects camelCase:
```typescript
stays.map(s => s.propertyId)  // ← undefined!
stay.checkIn                   // ← undefined!
```

### Issue 6: Duplicate Emails
- `push-booking` (line 229-250): Sends `send-booking-email` with `status: 'success'` for each booking
- `multi-push-booking` (line 261): Sends `send-itinerary-email` for the whole journey

For itinerary bookings, only the journey email should be sent.

## Solution Architecture

```text
CURRENT FLOW (Broken):
JourneyCheckout → multi-push-booking → push-booking → (email per booking)
                                                     ↓
                                      send-itinerary-email (HTML attachment)

FIXED FLOW:
JourneyCheckout → payfast-api (get UUID) → PayFast Modal
                                               ↓ (user pays)
                                          ITN callback
                                               ↓
                                    multi-push-booking
                                               ↓ (booking_channel = 'rol_itinerary')
                                          push-booking (skips guest email)
                                               ↓
                                    send-itinerary-email (single journey email, no attachment)
```

## Implementation Plan

### 1. Add PayFast Integration to JourneyCheckout

**File:** `src/pages/JourneyCheckout.tsx`

Changes:
1. Add PayFast modal import and state
2. Modify `handleCompleteBooking` to:
   - Save itinerary first
   - Call `payfast-api` with itinerary context
   - Open PayFast modal
   - Handle success → navigate to confirmation
3. Add `PayFastOnsiteModal` component

### 2. Fix Data Field Mapping in Email Functions

**File:** `supabase/functions/send-itinerary-email/index.ts`

Lines 288-305: Fix stay parsing to handle both snake_case and camelCase:
```typescript
const enrichedStays = stays.map(stay => ({
  propertyId: stay.propertyId || stay.property_id,
  propertyName: stay.propertyName || stay.property_name,
  checkIn: stay.checkIn || stay.dates?.check_in,
  checkOut: stay.checkOut || stay.dates?.check_out,
  nights: stay.nights || calculateNights(stay.dates?.check_in, stay.dates?.check_out),
  price: stay.price || stay.price_breakdown?.total || 0,
  guests: stay.guests || { adults: 2, children: 0, infants: 0 },
  roomTypeName: stay.roomTypeName || stay.rooms?.[0]?.room_type_name,
  city: stay.city || propertyMap.get(stay.propertyId || stay.property_id)?.city,
  country: stay.country || propertyMap.get(stay.propertyId || stay.property_id)?.country,
}));
```

### 3. Fix Same in PDF Generation

**File:** `supabase/functions/generate-itinerary-pdf/index.ts`

Lines 1692-1698: Apply same snake_case fallback:
```typescript
const stays: Stay[] = rawStays.map(s => ({
  propertyId: s.propertyId || s.property_id,
  propertyName: s.propertyName || s.property_name,
  checkIn: s.checkIn || s.dates?.check_in,
  checkOut: s.checkOut || s.dates?.check_out,
  // ... etc
}));
```

### 4. Stop Duplicate Guest Emails

**File:** `supabase/functions/push-booking/index.ts`

Lines 229-250: Skip guest email for itinerary bookings:
```typescript
// Only send guest email if NOT part of an itinerary
if (booking.booking_channel !== 'rol_itinerary') {
  // Send guest confirmation email...
}
```

### 5. Remove HTML Attachment from Itinerary Email

**File:** `supabase/functions/send-itinerary-email/index.ts`

Lines 314-353: Remove or simplify the attachment logic - keep brochure download as a CTA link instead of attachment.

### 6. Remove Promotional Text from Confirmation

**File:** `src/pages/JourneyConfirmation.tsx`

Lines 238-244: Remove the promotional paragraph:
```tsx
// DELETE these lines:
<h3 className="text-xl font-serif font-semibold mb-2">
  We've created a beautiful travel document just for you
</h3>
<p className="text-muted-foreground mb-6 max-w-md mx-auto">
  Complete with a personalized poem, weather forecast, and a surprise gift waiting inside!
</p>
```

### 7. Fix PayFast API for Itinerary Context

**File:** `supabase/functions/payfast-api/index.ts`

Add support for `itinerary_id` parameter so it can be passed through to the ITN callback, enabling the ITN to trigger `multi-push-booking` instead of `push-booking`.

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/JourneyCheckout.tsx` | Add PayFast integration |
| `src/pages/JourneyConfirmation.tsx` | Remove promotional text |
| `supabase/functions/send-itinerary-email/index.ts` | Fix field mapping, remove HTML attachment |
| `supabase/functions/generate-itinerary-pdf/index.ts` | Fix field mapping |
| `supabase/functions/push-booking/index.ts` | Skip guest email for itinerary bookings |
| `supabase/functions/payfast-api/index.ts` | Support itinerary context in ITN flow |

## Expected Outcome

After implementation:
1. PayFast payment required before journey confirmation
2. Email shows correct property name and dates
3. Only one email sent to guest (journey confirmation)
4. Brochure available as download link, not HTML attachment
5. Promotional text removed from confirmation page

## Testing Checklist

- [ ] Add a property to journey, proceed to checkout
- [ ] Verify PayFast modal opens when clicking "Confirm Booking"
- [ ] Complete test payment (card: 4000000000000002)
- [ ] Verify single journey email received (not booking email)
- [ ] Verify email shows correct property name and dates
- [ ] Download brochure from confirmation page
- [ ] Verify promotional text is removed

