

# White-Label Layout for Brand-Override Properties

## Problem
SIX on N has `brand_override_enabled = true`, but both PropertyShowcase and Booking pages still show ROL branding (PublicLayout with header/footer/nav). The white-label layout is only triggered by the `?integration=` URL parameter, not by the property's brand override setting.

## Fix

### 1. `src/pages/PropertyShowcase.tsx`
- After determining `shouldApplyBrand` (line ~573), use it to choose layout
- When `shouldApplyBrand` is true, wrap content in `WhiteLabelLayout` instead of `PublicLayout`
- Pass `propertyName` and `propertyLogoUrl` to WhiteLabelLayout
- The NightsBridge iframe path (line ~822) should also respect this — hide the ROL wreath logo when branded

### 2. `src/pages/Booking.tsx`
- Expand the `isIntegration` check at line 105 to also be true when property has `brand_override_enabled`
- Change: `const isWhiteLabel = isIntegration || property?.brand_override_enabled;`
- Use `isWhiteLabel` in the `wrapLayout` callback instead of `isIntegration`
- Keep `isIntegration` separate for the "Close window" vs "Return to Home" button logic

### 3. `src/pages/BookingConfirmation.tsx`
- Same pattern: check if property has brand override enabled and use WhiteLabelLayout accordingly

## Files

| Action | File |
|--------|------|
| Modify | `src/pages/PropertyShowcase.tsx` — conditional WhiteLabelLayout when branded |
| Modify | `src/pages/Booking.tsx` — expand white-label trigger to include brand_override_enabled |
| Modify | `src/pages/BookingConfirmation.tsx` — same pattern |

No database changes needed.

