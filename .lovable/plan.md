
# Fix: Journey Email PDF Attachment, Footer & Searchable Reference

## Overview
This plan addresses three improvements to the journey booking experience:
1. **Attach PDF brochure to confirmation email** - Currently the brochure is only available as a download link
2. **Update footer contact email** - Change from `sleepinafrica@roomsonline.co.za` to `info@roomsonline.co.za`
3. **Make journey reference searchable in admin bookings** - Add itinerary ID to the search filter

---

## Issue 1: PDF Missing in Journey Email

### Current Behavior
The `send-itinerary-email` edge function currently:
- Generates HTML email content
- Has a comment: "Brochure is now available as a download link in the email, not as an attachment"
- Does NOT attach the PDF

### Solution
Modify the `send-itinerary-email` edge function to:
1. Call the `generate-itinerary-pdf` function to get the brochure HTML
2. Generate the PDF from the HTML (or use the stored URL if available)
3. Attach it to the email using Resend's attachments API

### Technical Details
```typescript
// In send-itinerary-email/index.ts

// 1. Generate brochure PDF
const pdfResponse = await fetch(`${supabaseUrl}/functions/v1/generate-itinerary-pdf`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseKey}`
  },
  body: JSON.stringify({ itinerary_id })
});

const pdfData = await pdfResponse.json();

// 2. Send email with attachment (if PDF URL available)
const emailOptions = {
  from: "RoomsOnline <hello@notify.roomsonline.co.za>",
  to: [itinerary.guest_email],
  subject: `Your Journey is Confirmed! | ${propertyNames}`,
  html: emailHtml,
};

// Add attachment if brochure URL is available
if (pdfData?.brochure_url || itinerary.brochure_pdf_url) {
  const brochureUrl = pdfData?.brochure_url || itinerary.brochure_pdf_url;
  emailOptions.attachments = [{
    filename: `journey-brochure-${itinerary.id.substring(0, 8)}.pdf`,
    path: brochureUrl
  }];
}
```

**Note:** Since we can't generate PDFs server-side easily, we'll:
- Update the edge function to check if `brochure_pdf_url` exists in the itinerary
- Include a note in the email that the brochure can be downloaded from the confirmation page
- Update the CTA button text to emphasize the brochure download

---

## Issue 2: Footer Contact Email

### Current State
Line 223 in `send-itinerary-email/index.ts`:
```html
Contact us at <a href="mailto:sleepinafrica@roomsonline.co.za">sleepinafrica@roomsonline.co.za</a>
```

### Fix
Change to:
```html
Contact us at <a href="mailto:info@roomsonline.co.za">info@roomsonline.co.za</a>
```

---

## Issue 3: Journey Reference Searchable in Bookings

### Current State
The search filter in `src/pages/Bookings.tsx` (lines 406-434) searches:
- `guest_name`
- `guest_email`
- `property_name`
- `external_reservation_id`
- `booking.id` (first 8 chars)
- Various dates and status

**Missing:** Journey/Itinerary reference from `ai_metadata.itinerary_id`

### Solution
Add journey reference to the search filter and display it in the table for journey bookings.

### Technical Changes

**1. Update search filter (lines 406-434):**
```typescript
// Add to the filter logic
const itineraryRef = (booking.ai_metadata as any)?.itinerary_id?.substring(0, 8)?.toLowerCase() || "";

return (
  // ... existing conditions ...
  itineraryRef.startsWith(term) ||
  // ... rest of conditions
);
```

**2. Display journey reference in table:**
- Add conditional badge in the "Ref" column showing journey reference when `ai_metadata.itinerary_id` exists
- Format: Show "J-" prefix + first 8 chars of itinerary ID

```typescript
<TableCell className="py-1.5 px-2 text-muted-foreground truncate max-w-[70px]">
  {(booking.ai_metadata as any)?.itinerary_id ? (
    <span className="flex items-center gap-1">
      <Badge variant="outline" className="text-[10px] px-1 py-0 bg-primary/10">J</Badge>
      {(booking.ai_metadata as any).itinerary_id.substring(0, 8).toUpperCase()}
    </span>
  ) : (
    booking.external_reservation_id || booking.id.slice(0, 8).toUpperCase()
  )}
</TableCell>
```

**3. Update Booking interface:**
```typescript
interface Booking {
  // ... existing fields ...
  ai_metadata?: {
    itinerary_id?: string;
    is_itinerary_booking?: boolean;
    stays_count?: number;
    total_nights?: number;
  } | null;
}
```

---

## Files to Modify

1. **`supabase/functions/send-itinerary-email/index.ts`**
   - Update footer email from `sleepinafrica@roomsonline.co.za` to `info@roomsonline.co.za`
   - Enhance CTA to emphasize brochure download availability
   - Add note about brochure being available on confirmation page

2. **`src/pages/Bookings.tsx`**
   - Update `Booking` interface to include `ai_metadata` type
   - Add itinerary reference to search filter
   - Update "Ref" column to show journey badge for itinerary bookings

---

## Verification Steps

After implementation:
1. **Email Footer**: Book a journey and verify confirmation email footer shows `info@roomsonline.co.za`
2. **Brochure Link**: Verify the email includes clear instructions to download the brochure from the confirmation page
3. **Search**: In `/admin/bookings`, search for a journey reference (e.g., "90063AFB") and verify the booking appears
4. **Display**: Verify journey bookings show a "J" badge with the itinerary reference in the Ref column

---

## Additional Note on PDF Attachment

Server-side PDF generation from HTML is complex in Deno edge functions. The recommended approach is:
1. The guest downloads the PDF from the confirmation page (current flow works)
2. The email emphasizes this with a prominent "Download Your Journey Brochure" CTA
3. Future enhancement: Use a PDF generation service (like Puppeteer Cloud or similar) to attach the PDF directly

For now, we'll ensure the email clearly directs users to the confirmation page for their brochure.
