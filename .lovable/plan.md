

# Fix: Booking Confirmation Branding + Email Payment Status

## Two Root Causes Found

### Issue 1: Confirmation page shows ROL branding instead of property's
**Root cause**: In `src/pages/Booking.tsx` (line 95-106), when brand colors arrive via URL params (booking bar flow), the code calls `applyBrandToDocument(brand)` but does NOT call `saveBrandToSession(brand)`. The confirmation page calls `useBrandOverride()` without arguments, which tries to load from sessionStorage — and finds nothing.

**Fix**: Add `saveBrandToSession(brand)` in the `useEffect` at line 104 of `Booking.tsx`, right before or after `applyBrandToDocument`.

Additionally, the same inline-component bug exists in `BookingConfirmation.tsx` (line 91-98) — `LayoutWrapper` defined inside render causes re-mount on every state change. Convert to stable function pattern (same fix applied to `Booking.tsx` previously).

### Issue 2: Email says "not yet been paid" despite payment being confirmed
**Root cause**: The property `ea9a019d-...` (Latter Days) has a **custom email template** stored in `amenities.templates.template_content`. This custom template contains the text:

> "Payment Note: This reservation has not yet been paid. An invoice with deposit and settlement amounts will be issued by the property in due course."

This text is **hardcoded** in the custom template, not conditional. When `send-booking-email` detects a custom template (line 1145), it uses it verbatim with variable replacement only — it never injects payment-aware logic.

**Fix**: In `supabase/functions/send-booking-email/index.ts`, after processing the custom template with `replaceTemplateVariables`, add logic to:
1. If `booking.payment_status === "paid"`, strip the hardcoded "Payment Note" / "not yet been paid" text from the custom template output
2. Inject the standard payment confirmation block (green box with transaction ref, method, paid_at)

This ensures custom templates automatically reflect actual payment status regardless of what the property typed into their template.

## Files to Change

| File | Change |
|------|--------|
| `src/pages/Booking.tsx` | Add `saveBrandToSession(brand)` at line ~104 |
| `src/pages/BookingConfirmation.tsx` | Convert inline `LayoutWrapper` to stable `wrapLayout` function (same pattern as Booking.tsx fix) |
| `supabase/functions/send-booking-email/index.ts` | After custom template processing, strip hardcoded "not yet paid" text when `payment_status === "paid"` and inject payment confirmation block |

