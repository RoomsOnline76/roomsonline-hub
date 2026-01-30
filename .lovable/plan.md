
# Fix: Email Not Sending After Payment + Add Journey PDF Attachment

## ✅ COMPLETED

### Changes Implemented

**1. Fixed ITN Signature Verification** (`payfast-api/index.ts`)
- Added `dataToStringForItn()` function that sorts fields **alphabetically** (matching PayFast's PHP `ksort()` behavior)
- Added `generateItnSignature()` function specifically for ITN verification
- Updated `verifySignature()` to use alphabetical ordering instead of `PAYFAST_FIELD_ORDER`

**2. Added Journey Brochure Attachment** (`send-booking-email/index.ts`)
- Checks for associated itinerary via `itinerary_bookings` table
- Calls `generate-itinerary-pdf` edge function to get brochure HTML
- Attaches brochure as HTML file to confirmation email
- Updated email subject from "Reservation Confirmed" to "Booking Confirmed"

---

## Technical Details

### PayFast Signature Ordering

| Use Case | Field Order |
|----------|-------------|
| Outbound Requests (initiate_payment) | `PAYFAST_FIELD_ORDER` array |
| Inbound ITN Verification | Alphabetical (ksort) |

### Resend Attachments

```typescript
attachments: [{
  filename: `Journey-Brochure-${bookingRef}.html`,
  content: base64Content,  // Base64-encoded HTML
  content_type: "text/html",
}]
```

---

## Testing

1. Complete a test payment through PayFast
2. Verify ITN signature validation succeeds in logs
3. Confirm email arrives with journey brochure attachment
4. Verify booking status updates to "paid"
