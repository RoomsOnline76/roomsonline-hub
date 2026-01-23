
# Fix Global Branding Colour Inconsistency (ROL Pink)

## Executive Summary

The platform currently uses a deep burgundy/maroon color (`hsl(345 60% 38%)` = approximately `#9a2850`) as the primary brand color, along with scattered instances of Material Design Pink (`#e91e63`) and rose-red (`#e11d48`). All of these must be replaced with the correct ROL Pink: `#e91e8c`.

---

## Current State Analysis

### Color Audit Results

| Location | Current Color | Hex Equivalent | Issue |
|----------|---------------|----------------|-------|
| `src/index.css` line 31 | `--primary: 345 60% 38%` | ~#9a2850 (Burgundy) | Wrong - this is the Login button color |
| `src/index.css` line 104 | `--primary: 345 55% 55%` (dark mode) | ~#c24d6b | Wrong shade |
| `src/index.css` line 8 | `--rol-pink: 330 100% 77%` | ~#ff8fd8 | Too light/pink |
| `supabase/functions/forgot-password/index.ts` line 115 | `#e91e63` | Material Design Pink | Wrong |
| `supabase/functions/create-user/index.ts` line 224 | `#e91e63` | Material Design Pink | Wrong |
| `src/components/PropertyMap.tsx` line 105 | `#e11d48` | Rose-red | Wrong |

### Target Color

**ROL Pink: `#e91e8c`**

Converting to HSL for CSS variables:
- Hex: `#e91e8c`
- HSL: `326 82% 51%`

---

## Implementation Plan

### Phase 1: Update Source of Truth (CSS Variables)

**File: `src/index.css`**

Update the primary color CSS variables to use ROL Pink:

```text
Line 8:  --rol-pink: 330 100% 77%  →  --rol-pink: 326 82% 51%
Line 31: --primary: 345 60% 38%    →  --primary: 326 82% 51%
Line 56: --ring: 345 60% 38%       →  --ring: 326 82% 51%
Line 68: hero-gradient hsl values  →  Use new primary
Line 76: shadow-glow hsl values    →  Use new primary
Line 83: sidebar-primary           →  326 82% 51%
Line 88: sidebar-ring              →  326 82% 51%
```

**Dark mode updates (lines 91-148):**
```text
Line 104: --primary: 345 55% 55%         →  --primary: 326 85% 60%
Line 124: --ring: 345 55% 55%            →  --ring: 326 85% 60%
Line 137: shadow-glow                    →  Use new primary
Line 142: --sidebar-primary: 345 55% 55% →  --sidebar-primary: 326 85% 60%
Line 147: --sidebar-ring: 345 55% 55%    →  --sidebar-ring: 326 85% 60%
```

### Phase 2: Fix Inline Hardcoded Colors

| File | Line | Change |
|------|------|--------|
| `supabase/functions/forgot-password/index.ts` | 115 | `#e91e63` → `#e91e8c` |
| `supabase/functions/create-user/index.ts` | 224 | `#e91e63` → `#e91e8c` |
| `src/components/PropertyMap.tsx` | 105 | `#e11d48` → `#e91e8c` |

### Phase 3: Deploy Edge Functions

Redeploy the following functions to apply email template color changes:
- `forgot-password`
- `create-user`

---

## Technical Details

### HSL Conversion Reference

| Color | Hex | HSL |
|-------|-----|-----|
| ROL Pink | `#e91e8c` | `326 82% 51%` |
| ROL Pink Light (dark mode) | ~`#f04c9d` | `326 85% 60%` |

### Derived Shades (if needed)

For hover states or variations, these can be derived from the base:
- Hover: `326 82% 46%` (slightly darker)
- Active: `326 82% 41%` (darker still)
- Light variant: `326 82% 90%` (backgrounds)

---

## Files Modified

### Frontend (3 files)
1. `src/index.css` - CSS variables (source of truth)
2. `src/components/PropertyMap.tsx` - Map marker color

### Backend (2 files)
1. `supabase/functions/forgot-password/index.ts` - Email button
2. `supabase/functions/create-user/index.ts` - Email button

---

## Visual Impact

After this change:
- **Login button**: Will change from burgundy to bright ROL Pink
- **All primary buttons**: Will use ROL Pink
- **Form focus rings**: Will use ROL Pink
- **Links and accents**: Will use ROL Pink
- **Email CTA buttons**: Will use ROL Pink
- **Map markers**: Will use ROL Pink

---

## Verification Checklist

After implementation, verify these locations show `#e91e8c`:
- [ ] Auth page Login button
- [ ] Auth page "Send Reset Link" button
- [ ] All primary buttons in admin console
- [ ] Booking page CTAs
- [ ] Property map markers
- [ ] Email templates (forgot password, create user)
- [ ] Tab highlights and selection states
- [ ] Form input focus rings
