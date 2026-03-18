

## Fix: Consistent Property Branding + Payment Failure in Embed Flow

### Two Issues

**Issue 1: Branding breaks at checkout**
The `useBrandOverride(id)` hook on Booking.tsx applies CSS variables correctly, but the embed flow loses context. When `EmbedProperty.tsx` navigates to `/booking/${slug}`, it passes `brand_color` but Booking.tsx doesn't read or apply it. The CSS variables only get applied if the DB fetch succeeds and `brand_override_enabled` is true. For embeds, the brand color is explicitly passed but never used on the Booking page.

**Fix**: In `Booking.tsx`, read the `brand_color` URL parameter and apply it immediately as a CSS override, bypassing the DB check. This ensures the embed flow maintains consistent branding. Also pass `brand_secondary_color` and `brand_font_color` from the embed if available.

**Issue 2: Payment fails - `cell_number` format invalid**
Edge function logs show PayFast rejects the request because `cell_number: 1234567980` is invalid. PayFast sandbox requires either a valid SA mobile format (10 digits starting with `0`) or the field must be omitted entirely. The current code always sends `cell_number` even when the value isn't a valid SA number.

**Fix**: In `payfast-api/index.ts`, validate `cell_number` before including it. If it doesn't match a valid SA mobile pattern (10 digits starting with `0`), omit the field from the form data. This applies to both `initiate_payment` and `initiate_onsite_payment` actions.

### Changes

| File | Change |
|------|--------|
| `src/pages/Booking.tsx` | Read `brand_color`, `brand_secondary_color`, `brand_font_color` from URL params. If present, build a `PropertyBrand` object and call `applyBrandToDocument()` directly on mount, ensuring embed-originated bookings maintain property branding throughout checkout and payment. |
| `src/pages/EmbedProperty.tsx` | Pass `brand_secondary_color` and `brand_font_color` alongside the existing `brand_color` when navigating to `/booking/${slug}`. |
| `supabase/functions/payfast-api/index.ts` | Add SA cell number validation before including `cell_number` in form fields. If the cleaned number doesn't match `/^0[0-9]{9}$/`, omit it from the PayFast payload. Apply to both `initiate_payment` (~line 694) and `initiate_onsite_payment` (~line 796). |

### Branding Flow After Fix

```text
EmbedProperty → /booking/slug?brand_color=#xxx&brand_font_color=#fff
                    ↓
Booking.tsx reads URL brand params → applyBrandToDocument()
                    ↓
CSS vars override --primary, --secondary, --foreground
                    ↓
Confirm Booking button uses branded --primary
                    ↓
PayFast modal opens (inherits branded colors from document root)
```

