
# Fix: Email Not Sending After Payment + Add Journey PDF Attachment

## Problem Summary

Two issues were identified after successful PayFast payment:

1. **Confirmation email not sent** - The PayFast ITN (Instant Transaction Notification) signature verification is failing, preventing the payment status from being updated and the email from being triggered
2. **Journey PDF not attached** - The email function has no attachment capability; it only sends HTML content

---

## Root Cause Analysis

### Issue 1: ITN Signature Verification Failure

From the logs:
```
Generated signature: d20946fff87c4106ffb9e3b20145a2f4
Received signature: 2ea1e08fccf3ddae0814cac563af13a5
```

The problem is in how we verify ITN signatures:
- When generating signatures for outbound requests, we order fields using `PAYFAST_FIELD_ORDER`
- When verifying ITN signatures, PayFast sends fields in THEIR order (alphabetical by key)
- Our `dataToString` function reorders fields to `PAYFAST_FIELD_ORDER`, which breaks the signature

**PayFast ITN signature is calculated using alphabetical field order, not the custom order we use for outbound requests.**

### Issue 2: Missing PDF Attachment

The `send-booking-email` edge function only generates HTML content. It has no logic to:
- Generate or fetch the itinerary PDF brochure
- Attach files to the Resend email

---

## Solution

### Part 1: Fix ITN Signature Verification

Create a separate function for verifying ITN signatures that uses alphabetical field ordering (matching PayFast's server-side behavior).

**Changes to `supabase/functions/payfast-api/index.ts`:**

```typescript
// NEW: ITN-specific param string builder (uses alphabetical order like PayFast)
function dataToStringForItn(data: Record<string, string>): string {
  // PayFast ITN signatures use ALPHABETICAL field order, not custom order
  const sortedKeys = Object.keys(data)
    .filter(k => k !== 'signature' && data[k] !== "" && data[k] !== undefined && data[k] !== null)
    .sort(); // Alphabetical order
  
  return sortedKeys.map(key => `${key}=${pfUrlencode(String(data[key]))}`).join("&");
}

// UPDATE: Generate signature for ITN verification (alphabetical order)
function generateItnSignature(data: Record<string, string>, passphrase?: string): string {
  const paramString = dataToStringForItn(data);
  
  const stringToHash = passphrase && passphrase.length > 0
    ? `${paramString}&passphrase=${pfUrlencode(passphrase)}`
    : paramString;
  
  return md5Hash(stringToHash);
}

// UPDATE: verifySignature to use ITN-specific function
function verifySignature(data: Record<string, string>, signature: string, passphrase?: string): boolean {
  const dataWithoutSign = { ...data };
  delete dataWithoutSign.signature;
  
  const calculatedSignature = generateItnSignature(dataWithoutSign, passphrase);
  console.log("[PayFast] ITN Calculated signature:", calculatedSignature);
  console.log("[PayFast] ITN Received signature:", signature);
  
  return calculatedSignature === signature;
}
```

### Part 2: Add PDF Attachment to Confirmation Email

**Changes to `supabase/functions/send-booking-email/index.ts`:**

1. After generating the HTML email, call `generate-itinerary-pdf` to get the brochure
2. Convert the HTML brochure to PDF using a service or send as HTML attachment
3. Attach to the Resend email using their attachments API

```typescript
// Generate PDF brochure if booking has an itinerary
let attachments = [];

try {
  // Check if this booking has an associated itinerary
  const { data: itinerary } = await supabaseClient
    .from('itineraries')
    .select('id')
    .eq('booking_id', booking_id)
    .single();

  if (itinerary) {
    // Generate brochure HTML
    const brochureResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/generate-itinerary-pdf`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
        },
        body: JSON.stringify({ itinerary_id: itinerary.id }),
      }
    );
    
    if (brochureResponse.ok) {
      const brochureData = await brochureResponse.json();
      if (brochureData.html) {
        // Convert to base64 for attachment
        const encoder = new TextEncoder();
        const base64Content = btoa(String.fromCharCode(...encoder.encode(brochureData.html)));
        
        attachments.push({
          filename: `Journey-Brochure-${bookingRef}.html`,
          content: base64Content,
          content_type: 'text/html',
        });
      }
    }
  }
} catch (brochureError) {
  console.error('Failed to generate brochure attachment:', brochureError);
}

// Send email with attachments
const { data: emailData, error: emailError } = await resend.emails.send({
  from: fromEmail,
  to: [booking.guest_email],
  subject,
  html,
  attachments: attachments.length > 0 ? attachments : undefined,
});
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/payfast-api/index.ts` | Add `dataToStringForItn()` and `generateItnSignature()` functions; update `verifySignature()` to use alphabetical field order |
| `supabase/functions/send-booking-email/index.ts` | Add logic to fetch itinerary, generate brochure, and attach to email |

---

## Technical Details

### PayFast Signature Ordering

**Outbound Requests (initiate_payment, initiate_onsite_payment):**
- Use `PAYFAST_FIELD_ORDER` array to ensure fields are in PayFast's expected order
- This matches their documentation for form submissions

**Inbound ITN Verification:**
- PayFast signs ITN data using **alphabetical field order**
- This is standard PHP `ksort()` behavior on their server
- We must match this ordering when verifying

### Resend Attachments API

Resend supports attachments with:
```typescript
{
  filename: string,
  content: string, // base64 encoded
  content_type: string,
}
```

---

## Testing Verification

After implementation:
1. Complete a test payment through PayFast sandbox
2. Check edge function logs for `push-booking` execution
3. Verify confirmation email arrives with PDF attachment
4. Verify booking status updates to "paid" in database
